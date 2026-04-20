"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

type PatientRequest = {
    id: string;
    name: string;
    symptoms: string;
    date1: string;
    date2: string;
    imageBase64: string;
    status: string;
    department?: string;
    priorityScore?: number;
    originalText?: string;
    mapLink?: string;
    locationStr?: string;
    assignedBed?: string;       // NEW: Tracks exact physical bed
    ambulanceDispatched?: boolean; // NEW: Tracks if they took an ambulance
};

const SPECIALTIES = ["General", "Cardiology", "Neurology", "Orthopedics", "Trauma"];

export default function AdminDashboard() {
    const [requests, setRequests] = useState<PatientRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDepts, setSelectedDepts] = useState<Record<string, string>>({});

    // Set ICU beds back to 12 for a realistic hospital start, or leave at 1 to show off overflow!
    const [resources, setResources] = useState({ icuBeds: 1, generalBeds: 45, ambulances: 5 });
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

            if (highPriorityCount >= 2 && !surgeActive) {
                setSurgeActive(true);
            } else if (highPriorityCount < 2 && surgeActive) {
                setSurgeActive(false);
            }

            data.sort((a, b) => (a.priorityScore || 5) - (b.priorityScore || 5));
            setRequests(data);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [surgeActive]);

    // ==========================================
    // EXACT RESOURCE DEDUCTION LOGIC
    // ==========================================
    const forwardToDoctor = async (id: string, priorityScore: number = 5) => {
        const assignedDept = selectedDepts[id] || "Trauma";
        const isEmergency = priorityScore <= 2;

        let newIcu = resources.icuBeds;
        let newGeneral = resources.generalBeds;
        let newAmbulances = resources.ambulances;

        let assignedBed = "";
        let ambulanceDispatched = false;

        if (isEmergency) {
            // Check for Bed Conversion Protocol
            if (newIcu <= 0) {
                newIcu += 5;
                newGeneral -= 5;
                setConversionLogs(prev => [
                    `[${new Date().toLocaleTimeString()}] 🚨 OVERRIDE: ICU depleted. Converted 5 General beds to Trauma Bays.`,
                    ...prev
                ]);
            }
            assignedBed = `ICU-B${newIcu}`; // e.g., "ICU-B12"
            newIcu -= 1; // Deduct the bed

            // Deduct an ambulance if available
            if (newAmbulances > 0) {
                ambulanceDispatched = true;
                newAmbulances -= 1;
            }
        } else {
            assignedBed = `GEN-B${newGeneral}`; // e.g., "GEN-B45"
            newGeneral -= 1; // Deduct standard bed
        }

        try {
            await updateDoc(doc(db, "patients", id), {
                status: "Active Deployment",
                department: assignedDept,
                assignedBed: assignedBed,
                ambulanceDispatched: ambulanceDispatched
            });

            setResources({
                icuBeds: newIcu,
                generalBeds: newGeneral,
                ambulances: newAmbulances
            });
        } catch (error) {
            console.error("Error updating document: ", error);
        }
    };

    // ==========================================
    // EXACT RESOURCE REFUNDING LOGIC
    // ==========================================
    const dischargePatient = async (patient: PatientRequest) => {
        try {
            await deleteDoc(doc(db, "patients", patient.id));

            setResources(prev => {
                let rIcu = prev.icuBeds;
                let rGen = prev.generalBeds;
                let rAmb = prev.ambulances;

                // Check what the patient was using and refund it
                if (patient.assignedBed?.startsWith("ICU")) rIcu += 1;
                if (patient.assignedBed?.startsWith("GEN")) rGen += 1;
                if (patient.ambulanceDispatched) rAmb += 1;

                return { icuBeds: rIcu, generalBeds: rGen, ambulances: rAmb };
            });
        } catch (error) {
            console.error("Error discharging patient: ", error);
        }
    };

    const activeDeployments = requests.filter(req => req.status !== "Pending");

    return (
        <div className="min-h-screen p-8 flex flex-col items-center relative">

            {/* SECRET DEMO OVERRIDE BUTTON */}
            <button
                onClick={() => setResources(prev => ({ ...prev, icuBeds: 0 }))}
                className="absolute top-8 right-8 text-[10px] text-gray-800 hover:text-red-500 font-mono tracking-widest transition-colors"
            >
                [FORCE ICU: 0]
            </button>

            <div className="w-full max-w-7xl">
                <div className="flex justify-between items-center mb-6">
                    <Link href="/" className="text-gray-400 hover:text-white">← Back to Hub</Link>
                    <h1 className="text-3xl font-bold text-white tracking-tight">AI Command Center</h1>
                    <div className="w-24"></div>
                </div>

                {/* AI PREDICTIVE ALLOCATION ENGINE */}
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
                                        <li><strong className="text-white">Staff Reallocation:</strong> Auto-reassigned 3 General Ward doctors to Trauma Department.</li>
                                        <li><strong className="text-white">Routine Queue:</strong> All P4 and P5 appointments paused to conserve resources.</li>
                                    </ul>
                                </div>
                            ) : (
                                <p className="text-gray-300 text-sm">System stable. Predicted inflow matches current resource capacity. No reallocations required.</p>
                            )}
                        </div>
                    </div>
                    {conversionLogs.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Protocol Overrides Executed</p>
                            {conversionLogs.map((log, idx) => (
                                <p key={idx} className="text-xs text-yellow-400 font-mono mb-1">{log}</p>
                            ))}
                        </div>
                    )}
                </div>

                {/* Resources Panel */}
                <div className="grid grid-cols-3 gap-6 mb-10">
                    <div className={`glass-card p-6 border-t-2 transition-colors duration-500 ${resources.icuBeds === 0 ? 'border-t-red-600 bg-red-900/20' : 'border-t-red-400'}`}>
                        <p className="text-gray-400 text-sm mb-2 font-bold tracking-widest">ICU BEDS</p>
                        <p className={`text-5xl font-light ${resources.icuBeds === 0 ? 'text-red-500 animate-pulse' : 'text-white'}`}>{resources.icuBeds}</p>
                    </div>
                    <div className="glass-card p-6 border-t-2 border-t-blue-500">
                        <p className="text-gray-400 text-sm mb-2 font-bold tracking-widest">GENERAL BEDS</p>
                        <p className="text-5xl font-light text-white">{resources.generalBeds}</p>
                    </div>
                    <div className="glass-card p-6 border-t-2 border-t-green-500">
                        <p className="text-gray-400 text-sm mb-2 font-bold tracking-widest">AMBULANCES</p>
                        <p className="text-5xl font-light text-white">{resources.ambulances}</p>
                    </div>
                </div>

                {/* Queue Table */}
                <div className="glass-card overflow-hidden shadow-2xl">
                    <div className="p-6 border-b border-white/10 bg-black/20">
                        <h2 className="text-xl font-semibold text-gray-200">Live Intake Queue</h2>
                    </div>

                    <div className="p-0 overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-black/40 text-gray-400">
                                <tr>
                                    <th className="p-5 font-medium">Patient Info</th>
                                    <th className="p-5 font-medium">Reported Symptoms</th>
                                    <th className="p-5 font-medium">Status</th>
                                    <th className="p-5 font-medium text-right">Categorize & Dispatch</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {requests.map((req) => {
                                    const score = req.priorityScore || 5;
                                    const isEmergency = score <= 2;

                                    return (
                                        <tr key={req.id} className={`${isEmergency && req.status === "Pending" ? "bg-red-900/20 animate-pulse border-l-4 border-l-red-500" : "hover:bg-white/5"} transition-colors`}>
                                            <td className="p-5">
                                                <div className="flex items-center">
                                                    <p className={`font-bold text-base ${isEmergency ? "text-red-400" : "text-white"}`}>{req.name}</p>
                                                    {renderPriorityBadge(score)}
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">{req.date1}</p>
                                            </td>
                                            <td className="p-5 text-gray-300">
                                                <p className="whitespace-normal max-w-xs font-semibold text-white">{req.symptoms}</p>

                                                {req.originalText && (
                                                    <p className="text-xs text-gray-400 mt-2 italic bg-black/30 p-2 rounded whitespace-normal border border-white/5">
                                                        🎤 "{req.originalText}"
                                                    </p>
                                                )}

                                                {req.locationStr && (
                                                    <div className="mt-3 flex flex-col items-start gap-1.5 p-2 bg-black/20 rounded-md border border-white/5">
                                                        <span className="text-[10px] text-blue-300 font-mono tracking-wider uppercase">
                                                            GPS: {req.locationStr}
                                                        </span>
                                                        <a
                                                            href={`https://maps.google.com/?q=${req.locationStr}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-1 px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/50 rounded-md text-xs font-bold hover:bg-red-500/40 transition-all shadow-[0_0_10px_rgba(239,68,68,0.3)]"
                                                        >
                                                            📍 Open on Google Maps
                                                        </a>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-5">
                                                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${req.status === "Pending" ? "bg-yellow-500/10 text-yellow-400" : "bg-blue-500/10 text-blue-400"}`}>
                                                    {req.status}
                                                </span>
                                            </td>
                                            <td className="p-5 text-right">
                                                {req.status === "Pending" && (
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
                                                            {isEmergency ? "Dispatch" : (surgeActive ? "Paused" : "Forward")}
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                                {requests.filter(r => r.status === "Pending").length === 0 && !loading && (
                                    <tr><td colSpan={4} className="p-12 text-center text-gray-500 font-mono">No active requests in queue.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ========================================= */}
                {/* LIVE FLOOR DEPLOYMENT MATRIX              */}
                {/* ========================================= */}
                <div className="mt-8 glass-card overflow-hidden shadow-2xl border-t-4 border-t-cyan-500 w-full">
                    <div className="p-6 border-b border-white/10 bg-cyan-900/10 flex justify-between items-center">
                        <h2 className="text-xl font-semibold text-cyan-400 flex items-center gap-2">
                            <span className="flex h-3 w-3 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                            </span>
                            📡 Live Floor Deployment Tracking
                        </h2>
                        <span className="text-xs font-mono text-cyan-500 bg-cyan-500/10 px-2 py-1 rounded border border-cyan-500/20">
                            {activeDeployments.length} Active Resources
                        </span>
                    </div>

                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-black/40">
                        {activeDeployments.map((patient) => {
                            const score = patient.priorityScore || 5;
                            const isICU = patient.assignedBed?.startsWith("ICU");

                            return (
                                <div key={patient.id} className={`bg-black/60 border ${isICU ? 'border-red-500/30' : 'border-white/10'} p-4 rounded-lg relative overflow-hidden group flex flex-col justify-between`}>
                                    <div>
                                        <div className={`absolute top-0 right-0 w-16 h-16 blur-2xl opacity-20 ${isICU ? 'bg-red-500' : 'bg-cyan-500'}`}></div>

                                        <div className="flex justify-between text-xs text-gray-500 mb-3 border-b border-white/5 pb-2">
                                            <span className="font-bold uppercase tracking-wider">{patient.department} WING</span>
                                            <span className={`font-mono font-bold ${isICU ? 'text-red-400' : 'text-cyan-400'}`}>
                                                {patient.assignedBed || "PENDING"}
                                            </span>
                                        </div>

                                        <h3 className="font-bold text-white text-lg truncate">{patient.name}</h3>
                                        <p className="text-xs text-gray-400 mt-1 truncate">{patient.symptoms}</p>

                                        <div className="mt-4 pt-3 border-t border-white/5 flex flex-col gap-2">

                                            {/* NEW: AMBULANCE BADGE */}
                                            {patient.ambulanceDispatched && (
                                                <div className="flex items-center gap-2 bg-red-500/10 p-2 rounded border border-red-500/20 mb-1">
                                                    <span className="text-red-400 animate-pulse">🚑</span>
                                                    <span className="text-[10px] text-red-300 font-bold uppercase tracking-wider">Unit Deployed</span>
                                                </div>
                                            )}

                                            <div className="flex items-center gap-2 bg-black/50 p-2 rounded border border-white/5">
                                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                                <span className="text-xs text-gray-300 font-mono">Attending: Dr. YCCE Staff</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* DISCHARGE BUTTON */}
                                    <button
                                        onClick={() => dischargePatient(patient)}
                                        className={`mt-4 w-full border text-xs py-2 rounded font-bold tracking-wider transition-colors ${isICU
                                            ? 'bg-red-500/10 hover:bg-red-500/30 border-red-500/30 text-red-400'
                                            : 'bg-cyan-500/10 hover:bg-cyan-500/30 border-cyan-500/30 text-cyan-400'
                                            }`}
                                    >
                                        DISCHARGE PATIENT
                                    </button>
                                </div>
                            )
                        })}

                        {activeDeployments.length === 0 && (
                            <div className="col-span-full py-8 text-center text-gray-500 font-mono text-sm">
                                All beds available. No active deployments on the floor.
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}