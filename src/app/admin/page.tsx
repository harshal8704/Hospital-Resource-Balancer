"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

type PatientRequest = {
    id: string;
    name: string;
    symptoms: string;
    contact?: string;
    date1: string;
    date2: string;
    imageBase64: string;
    status: string;
    department?: string;
    priorityScore?: number;
    originalText?: string;
    mapLink?: string;
    locationStr?: string;
    assignedBed?: string;
    ambulanceDispatched?: boolean;
    attendingDoctor?: string;
    confirmedDate?: string;
    // NEW: Added the variables from your WhatsApp Webhook!
    distanceKm?: string;
    etaMinutes?: number;
};

const SPECIALTIES = ["General", "Cardiology", "Neurology", "Orthopedics", "Trauma"];
const HOSPITAL_ROSTER = [
    { id: "d1", name: "Dr. Vance", baseDept: "Trauma" },
    { id: "d2", name: "Dr. Cole", baseDept: "Trauma" },
    { id: "d3", name: "Dr. Hayes", baseDept: "Cardiology" },
    { id: "d4", name: "Dr. Brooks", baseDept: "Neurology" },
    { id: "d5", name: "Dr. Smith", baseDept: "Orthopedics" },
    { id: "d6", name: "Dr. Lin", baseDept: "General" },
    { id: "d7", name: "Dr. Patel", baseDept: "General" },
];

export default function AdminDashboard() {
    const [requests, setRequests] = useState<PatientRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDepts, setSelectedDepts] = useState<Record<string, string>>({});
    const [surgeActive, setSurgeActive] = useState(false);
    const [conversionLogs, setConversionLogs] = useState<string[]>([]);

    const renderPriorityBadge = (score: number = 5) => {
        const colors: Record<number, string> = {
            1: "bg-red-500/20 text-red-400 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.3)]",
            2: "bg-orange-500/20 text-orange-400 border-orange-500/50",
            3: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
            4: "bg-blue-500/20 text-blue-400 border-blue-500/50",
            5: "bg-gray-500/20 text-gray-400 border-gray-500/50"
        };
        const activeColor = colors[score] || colors[5];
        return <span className={`ml-3 text-[10px] font-bold px-2 py-0.5 rounded border ${activeColor}`}>P{score}</span>;
    };

    useEffect(() => {
        const q = query(collection(db, "patients"), orderBy("timestamp", "desc"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const data: PatientRequest[] = [];
            let highPriorityCount = 0;

            querySnapshot.forEach((documentSnapshot) => {
                const req = { id: documentSnapshot.id, ...documentSnapshot.data() } as PatientRequest;
                data.push(req);
                if (req.priorityScore && req.priorityScore <= 2 && req.status === "Pending") {
                    highPriorityCount++;
                }
            });

            setSurgeActive(highPriorityCount >= 2);
            setRequests(data);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const pendingQueue = requests
        .filter(req => req.status === "Pending")
        .sort((a, b) => (a.priorityScore || 5) - (b.priorityScore || 5));

    const activeDeployments = requests.filter(req => req.status === "Active Deployment");

    const confirmedAppointments = requests
        .filter(req => req.status.startsWith("Confirmed"))
        .sort((a, b) => new Date(a.confirmedDate || "").getTime() - new Date(b.confirmedDate || "").getTime());

    let currentIcuCap = 2;
    let currentGenCap = 45;
    const TOTAL_AMB = 5;

    let usedIcu = 0;
    let usedGen = 0;
    let usedAmb = 0;

    activeDeployments.forEach(req => {
        if (req.assignedBed?.startsWith("ICU")) usedIcu++;
        if (req.assignedBed?.startsWith("GEN")) usedGen++;
        if (req.ambulanceDispatched) usedAmb++;
    });

    if (usedIcu > currentIcuCap) {
        const overflow = usedIcu - currentIcuCap;
        const chunks = Math.ceil(overflow / 5);
        currentIcuCap += (chunks * 5);
        currentGenCap -= (chunks * 5);
    }

    const availableIcu = currentIcuCap - usedIcu;
    const availableGen = currentGenCap - usedGen;
    const availableAmb = Math.max(0, TOTAL_AMB - usedAmb);

    const forwardToDoctor = async (id: string, priorityScore: number = 5) => {
        // 1. Get the department from the dropdown (defaults to Trauma for P1/P2, General for others)
        const isEmergency = priorityScore <= 2;
        const assignedDept = selectedDepts[id] || (isEmergency ? "Trauma" : "General");

        const MAX_SAFE_LOAD = 2;

        // 2. Map the roster with current live loads
        const rosterWithLoads = HOSPITAL_ROSTER.map(doc => {
            const load = activeDeployments.filter(req => req.attendingDoctor === doc.name).length;
            return { ...doc, currentLoad: load };
        });

        // 3. Find doctors WHO ACTUALLY BELONG to the selected department
        // We only allow "General" doctors to help in "Trauma" during a surge, 
        // NOT the other way around (Trauma doctors shouldn't do routine appointments).
        let eligibleDocs = rosterWithLoads.filter(doc => {
            if (assignedDept === "Trauma" && surgeActive && isEmergency) {
                return doc.baseDept === "Trauma" || doc.baseDept === "General";
            }
            return doc.baseDept === assignedDept;
        });

        // 4. Sort to find the least busy doctor in that specific department
        eligibleDocs.sort((a, b) => a.currentLoad - b.currentLoad);
        let bestDocObj = eligibleDocs[0];

        // 5. 🚨 CROSS-DEPARTMENT DRAFTING (ONLY for Emergencies)
        if (isEmergency && bestDocObj && bestDocObj.currentLoad >= MAX_SAFE_LOAD) {
            // If the selected department is full, find ANY doctor in the whole hospital with 0-1 load
            rosterWithLoads.sort((a, b) => a.currentLoad - b.currentLoad);
            const draftedDoc = rosterWithLoads[0];

            if (draftedDoc.name !== bestDocObj.name) {
                setConversionLogs(prev => [
                    `[${new Date().toLocaleTimeString()}] ⚠️ OVERLOAD: ${assignedDept} Wing full. Auto-drafted ${draftedDoc.name} from ${draftedDoc.baseDept} for Emergency.`,
                    ...prev
                ]);
                bestDocObj = draftedDoc;
            }
        }

        // If no doctor found (rare), fallback to a generic name
        const bestDoctor = bestDocObj ? bestDocObj.name : "Dr. Lin"; // Fallback to General lead

        // 6. Handle Bed Logic
        let assignedBed = "";
        let ambulanceDispatched = false;
        let newStatus = "Awaiting Doctor Confirmation";

        if (isEmergency) {
            newStatus = "Active Deployment";
            assignedBed = `ICU-B${usedIcu + 1}`;
            if (availableAmb > 0) ambulanceDispatched = true;
        } else {
            assignedBed = "Outpatient (OPD)";
        }

        try {
            await updateDoc(doc(db, "patients", id), {
                status: newStatus,
                department: assignedDept,
                assignedBed: assignedBed,
                ambulanceDispatched: ambulanceDispatched,
                attendingDoctor: bestDoctor
            });
        } catch (error) {
            console.error("Error updating document: ", error);
        }
    };

    const dischargePatient = async (patient: PatientRequest) => {
        try {
            await deleteDoc(doc(db, "patients", patient.id));
        } catch (error) {
            console.error("Error discharging patient: ", error);
        }
    };

    return (
        <div className="min-h-screen p-8 flex flex-col items-center relative">
            <div className="w-full max-w-7xl">
                <div className="flex justify-between items-center mb-6">
                    <Link href="/" className="text-gray-400 hover:text-white">← Back to Hub</Link>
                    <h1 className="text-3xl font-bold text-white tracking-tight">AI Command Center</h1>
                    <div className="w-24"></div>
                </div>

                <div className={`glass-card mb-8 p-6 border-l-4 transition-all duration-500 ${surgeActive ? 'border-l-purple-500 bg-purple-900/20' : 'border-l-blue-500 bg-blue-900/10'}`}>
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className={`text-xl font-bold mb-2 flex items-center gap-2 ${surgeActive ? 'text-purple-400' : 'text-blue-400'}`}>
                                🧠 Nexus AI Allocator
                                {surgeActive && <span className="flex h-3 w-3 relative ml-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span></span>}
                            </h2>
                            {surgeActive ? (
                                <div className="space-y-2">
                                    <p className="text-white font-semibold">⚠️ SURGE PREDICTED: Multiple P1/P2 trauma cases detected. Mass casualty event likely.</p>
                                    <ul className="text-sm text-gray-300 space-y-1 ml-4 list-disc marker:text-purple-500">
                                        <li><strong className="text-white">Staff Reallocation:</strong> General Ward doctors physically redeployed to Trauma.</li>
                                        <li><strong className="text-white">Routine Queue:</strong> All P4 and P5 appointments paused to conserve resources.</li>
                                    </ul>
                                </div>
                            ) : (
                                <p className="text-gray-300 text-sm">System stable. Predicted inflow matches current resource capacity. No reallocations required.</p>
                            )}
                        </div>
                    </div>
                    {conversionLogs.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-1">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Protocol Overrides Executed</p>
                            {conversionLogs.map((log, idx) => (
                                <p key={idx} className={`text-xs font-mono ${log.includes('BURNOUT') || log.includes('DRAFTED') ? 'text-orange-400' : 'text-yellow-400'}`}>{log}</p>
                            ))}
                        </div>
                    )}
                </div>

                {/* LIVE STAFF WORKLOAD ROSTER */}
                <div className="glass-card p-6 mb-8 border-t-2 border-t-indigo-500 bg-indigo-900/5">
                    <div className="flex justify-between items-center mb-4">
                        <p className="text-indigo-400 text-sm font-bold tracking-widest flex items-center gap-2">
                            👨‍⚕️ LIVE STAFF WORKLOAD (MAX CAPACITY: 2)
                        </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        {HOSPITAL_ROSTER.map((doc) => {
                            const isSurged = surgeActive && doc.baseDept === "General";
                            const currentLoad = activeDeployments.filter(req => req.attendingDoctor === doc.name).length;
                            const isOverloaded = currentLoad >= 2;

                            return (
                                <div key={doc.id} className={`p-3 rounded-lg border flex flex-col justify-between h-24 transition-colors ${isSurged ? 'bg-purple-900/30 border-purple-500/50' : (isOverloaded ? 'bg-red-900/30 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-black/40 border-white/10')}`}>
                                    <div>
                                        <h3 className="text-white font-bold text-sm truncate">{doc.name}</h3>
                                        <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 truncate ${isSurged ? 'text-purple-400' : 'text-gray-500'}`}>
                                            {isSurged ? 'REDEPLOYED' : doc.baseDept}
                                        </p>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <span className="text-[10px] text-gray-400">Load:</span>
                                        <span className={`text-lg font-mono font-bold leading-none ${isOverloaded ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
                                            {currentLoad}/2
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* DERIVED RESOURCES DISPLAY */}
                <div className="grid grid-cols-3 gap-6 mb-10">
                    <div className={`glass-card p-6 border-t-2 transition-colors duration-500 ${availableIcu === 0 ? 'border-t-red-600 bg-red-900/20' : 'border-t-red-400'}`}>
                        <p className="text-gray-400 text-sm mb-2 font-bold tracking-widest">ICU BEDS</p>
                        <p className={`text-5xl font-light ${availableIcu === 0 ? 'text-red-500 animate-pulse' : 'text-white'}`}>{availableIcu}</p>
                    </div>
                    <div className="glass-card p-6 border-t-2 border-t-blue-500">
                        <p className="text-gray-400 text-sm mb-2 font-bold tracking-widest">GENERAL BEDS</p>
                        <p className="text-5xl font-light text-white">{availableGen}</p>
                    </div>
                    <div className="glass-card p-6 border-t-2 border-t-green-500">
                        <p className="text-gray-400 text-sm mb-2 font-bold tracking-widest">AMBULANCES</p>
                        <p className="text-5xl font-light text-white">{availableAmb}</p>
                    </div>
                </div>

                {/* INTAKE QUEUE */}
                <div className="glass-card overflow-hidden shadow-2xl mb-8">
                    <div className="p-6 border-b border-white/10 bg-black/20">
                        <h2 className="text-xl font-semibold text-gray-200">Live Intake Queue</h2>
                    </div>
                    <div className="p-0 overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-black/40 text-gray-400">
                                <tr>
                                    <th className="p-5 font-medium w-1/4">Patient Info</th>
                                    <th className="p-5 font-medium w-2/4">Reported Symptoms & Diagnostics</th>
                                    <th className="p-5 font-medium w-1/4 text-right">Categorize & Dispatch</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {pendingQueue.map((req) => {
                                    const score = req.priorityScore || 5;
                                    const isEmergency = score <= 2;

                                    return (
                                        <tr key={req.id} className={`${isEmergency ? "bg-red-900/20 animate-pulse border-l-4 border-l-red-500" : "hover:bg-white/5"} transition-colors`}>
                                            <td className="p-5 align-top">
                                                <div className="flex items-center">
                                                    <p className={`font-bold text-base ${isEmergency ? "text-red-400" : "text-white"}`}>{req.name}</p>
                                                    {renderPriorityBadge(score)}
                                                </div>
                                                {req.contact && <p className="text-xs text-gray-400 mt-1">📞 {req.contact}</p>}
                                                {req.phone && !req.contact && <p className="text-xs text-gray-400 mt-1">📱 WhatsApp: {req.phone}</p>}
                                            </td>

                                            <td className="p-5 align-top text-gray-300">
                                                <p className="whitespace-normal max-w-md font-semibold text-white mb-2">{req.symptoms}</p>

                                                {req.originalText && req.originalText !== req.symptoms && (
                                                    <p className="text-xs text-gray-400 mb-3 italic bg-black/30 p-2 rounded whitespace-normal border border-white/5">🎤 "{req.originalText}"</p>
                                                )}

                                                {/* NEW: UPGRADED LOCATION BADGE WITH ETA */}
                                                {req.locationStr && (
                                                    <div className="mt-2 flex flex-col items-start gap-2 p-3 bg-black/40 rounded-lg border border-blue-500/20 shadow-[inset_0_0_10px_rgba(59,130,246,0.1)]">
                                                        <div className="flex justify-between items-center w-full">
                                                            <span className="text-[10px] text-blue-400 font-bold tracking-wider uppercase">🛰️ Live GPS Coordinates Acquired</span>
                                                            {req.etaMinutes && (
                                                                <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded font-bold animate-pulse">
                                                                    🚑 ETA: {req.etaMinutes} MINS
                                                                </span>
                                                            )}
                                                        </div>

                                                        {req.distanceKm && (
                                                            <span className="text-xs text-gray-300 font-mono">Distance: <strong className="text-white">{req.distanceKm} km</strong> from GMC Base</span>
                                                        )}

                                                        <a
                                                            href={`https://maps.google.com/?q=${req.locationStr}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/50 rounded text-xs font-bold transition-all shadow-[0_0_10px_rgba(59,130,246,0.2)]"
                                                        >
                                                            📍 Track Patient on Maps
                                                        </a>
                                                    </div>
                                                )}
                                            </td>

                                            <td className="p-5 align-top text-right">
                                                <div className="flex flex-col items-end gap-2">
                                                    <span className={`px-3 py-1 mb-2 rounded-full text-[10px] font-bold uppercase tracking-wider ${req.status === "Pending" ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" : "bg-blue-500/10 text-blue-400"}`}>
                                                        {req.status}
                                                    </span>
                                                    <div className="flex items-center justify-end gap-2">
                                                        <select
                                                            className="bg-black/50 border border-gray-700 text-gray-300 text-sm rounded-md p-2 outline-none"
                                                            value={selectedDepts[req.id] || (isEmergency ? "Trauma" : "General")}
                                                            onChange={(e) => setSelectedDepts({ ...selectedDepts, [req.id]: e.target.value })}
                                                            disabled={surgeActive && !isEmergency}
                                                        >
                                                            {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                                                        </select>
                                                        <button
                                                            onClick={() => forwardToDoctor(req.id, score)}
                                                            className={`${isEmergency ? "bg-red-600 hover:bg-red-500" : "bg-blue-600 hover:bg-blue-500"} ${surgeActive && !isEmergency ? "opacity-50 cursor-not-allowed" : ""} text-white px-4 py-2 rounded-md font-medium transition-colors`}
                                                            disabled={surgeActive && !isEmergency}
                                                        >
                                                            {isEmergency ? "Deploy Bed" : "Fwd to Doctor"}
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                                {pendingQueue.length === 0 && !loading && (
                                    <tr><td colSpan={3} className="p-12 text-center text-gray-500 font-mono">No active requests in queue.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* EMERGENCY MATRIX */}
                {activeDeployments.length > 0 && (
                    <div className="glass-card overflow-hidden shadow-2xl border-t-4 border-t-cyan-500 w-full mb-8">
                        <div className="p-6 border-b border-white/10 bg-cyan-900/10 flex justify-between items-center">
                            <h2 className="text-xl font-semibold text-cyan-400 flex items-center gap-2">
                                <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span></span>
                                📡 Emergency Inpatient Deployments
                            </h2>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-black/40">
                            {activeDeployments.map((patient) => (
                                <div key={patient.id} className="bg-black/60 border border-red-500/30 p-4 rounded-lg relative overflow-hidden group flex flex-col justify-between">
                                    <div>
                                        <div className="absolute top-0 right-0 w-16 h-16 blur-2xl opacity-20 bg-red-500"></div>
                                        <div className="flex justify-between text-xs text-gray-500 mb-3 border-b border-white/5 pb-2">
                                            <span className="font-bold uppercase tracking-wider">{patient.department} WING</span>
                                            <span className="font-mono font-bold text-red-400">{patient.assignedBed}</span>
                                        </div>
                                        <h3 className="font-bold text-white text-lg truncate">{patient.name}</h3>
                                        <p className="text-xs text-gray-400 mt-1 truncate">{patient.symptoms}</p>
                                        <div className="mt-4 pt-3 border-t border-white/5 flex flex-col gap-2">

                                            {/* ADDED ETA TO THE FLOOR DEPLOYMENT MATRIX TOO */}
                                            {patient.ambulanceDispatched && patient.etaMinutes && (
                                                <div className="flex items-center gap-2 bg-red-500/10 p-2 rounded border border-red-500/20 mb-1">
                                                    <span className="text-red-400 animate-pulse">🚑</span>
                                                    <span className="text-[10px] text-red-300 font-bold uppercase tracking-wider">Unit Deployed (ETA: {patient.etaMinutes}m)</span>
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between bg-black/50 p-2 rounded border border-white/5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                                    <span className="text-xs text-gray-300 font-mono truncate">Attending:</span>
                                                </div>
                                                <span className="text-xs font-bold text-indigo-400">{patient.attendingDoctor || "Standby"}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => dischargePatient(patient)} className="mt-4 w-full border text-xs py-2 rounded font-bold tracking-wider transition-colors bg-red-500/10 hover:bg-red-500/30 border-red-500/30 text-red-400">
                                        DISCHARGE PATIENT
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* UPCOMING APPOINTMENTS CALENDAR */}
                <div className="glass-card overflow-hidden shadow-2xl border-t-4 border-t-emerald-500 w-full mb-12">
                    <div className="p-6 border-b border-white/10 bg-emerald-900/10 flex justify-between items-center">
                        <h2 className="text-xl font-semibold text-emerald-400 flex items-center gap-2">📅 Upcoming Outpatient Appointments</h2>
                        <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">{confirmedAppointments.length} Scheduled</span>
                    </div>
                    <div className="p-0 overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-black/40 text-gray-400 border-b border-white/5">
                                <tr>
                                    <th className="p-5 font-medium text-emerald-400">Confirmed Date</th>
                                    <th className="p-5 font-medium">Patient Info</th>
                                    <th className="p-5 font-medium">Attending Physician</th>
                                    <th className="p-5 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 bg-black/20">
                                {confirmedAppointments.map(patient => (
                                    <tr key={patient.id} className="hover:bg-white/5 transition-colors">
                                        <td className="p-5">
                                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-md font-mono font-bold">
                                                {patient.confirmedDate}
                                            </span>
                                        </td>
                                        <td className="p-5">
                                            <p className="font-bold text-white">{patient.name}</p>
                                            {patient.contact && <p className="text-xs text-gray-400">📞 {patient.contact}</p>}
                                        </td>
                                        <td className="p-5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                                <span className="text-gray-300 font-medium">{patient.attendingDoctor}</span>
                                            </div>
                                        </td>
                                        <td className="p-5 text-right">
                                            <button onClick={() => dischargePatient(patient)} className="text-xs text-gray-500 hover:text-red-400 border border-gray-700 hover:border-red-500/50 px-3 py-1 rounded transition-colors">Complete & Remove</button>
                                        </td>
                                    </tr>
                                ))}
                                {confirmedAppointments.length === 0 && (
                                    <tr><td colSpan={4} className="p-12 text-center text-gray-500 font-mono">No upcoming appointments scheduled.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}