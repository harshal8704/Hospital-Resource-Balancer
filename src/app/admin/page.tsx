"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, doc, updateDoc, query, orderBy } from "firebase/firestore";
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
    priority?: string;
    originalText?: string;
    mapLink?: string;
};

const SPECIALTIES = ["General", "Cardiology", "Neurology", "Orthopedics", "Trauma"];

export default function AdminDashboard() {
    const [requests, setRequests] = useState<PatientRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDepts, setSelectedDepts] = useState<Record<string, string>>({});

    // Starting with 1 ICU bed so you can easily demo the Bed Conversion!
    const [resources, setResources] = useState({ icuBeds: 1, generalBeds: 45, ambulances: 5 });

    // AI State Trackers
    const [surgeActive, setSurgeActive] = useState(false);
    const [conversionLogs, setConversionLogs] = useState<string[]>([]);

    // REAL-TIME LISTENER FOR ADMIN
    useEffect(() => {
        const q = query(collection(db, "patients"), orderBy("timestamp", "desc"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const data: PatientRequest[] = [];
            let highPriorityCount = 0;

            querySnapshot.forEach((doc) => {
                const req = { id: doc.id, ...doc.data() } as PatientRequest;
                data.push(req);
                if (req.priority === "High" && req.status === "Pending") {
                    highPriorityCount++;
                }
            });

            // IDEA 2: SURGE PREDICTION ENGINE
            // If 2 or more emergencies are pending, AI predicts a surge event
            if (highPriorityCount >= 2 && !surgeActive) {
                setSurgeActive(true);
            } else if (highPriorityCount < 2 && surgeActive) {
                setSurgeActive(false);
            }

            data.sort((a, b) => (a.priority === "High" ? -1 : 1));
            setRequests(data);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [surgeActive]);

    const forwardToDoctor = async (id: string, isEmergency: boolean) => {
        const assignedDept = selectedDepts[id] || "Trauma";
        try {
            await updateDoc(doc(db, "patients", id), {
                status: "Forwarded to Doctor",
                department: assignedDept,
            });

            if (isEmergency) {
                let newIcu = resources.icuBeds;
                let newGeneral = resources.generalBeds;

                // IDEA 3: DYNAMIC BED CONVERSION
                if (newIcu <= 0) {
                    newIcu += 5; // Steal 5 beds from General
                    newGeneral -= 5;
                    setConversionLogs(prev => [
                        `[${new Date().toLocaleTimeString()}] 🚨 OVERRIDE: ICU depleted. Converted 5 General beds to Trauma Bays.`,
                        ...prev
                    ]);
                }

                // Deduct resources
                setResources(prev => ({
                    ...prev,
                    icuBeds: newIcu - 1,
                    generalBeds: newGeneral,
                    ambulances: prev.ambulances > 0 ? prev.ambulances - 1 : 0
                }));
            }
        } catch (error) {
            console.error("Error updating document: ", error);
        }
    };
    const exportToCSV = () => {
        const headers = ["Name,Symptoms,Department,Priority,Status,Timestamp\n"];
        const csvData = requests.map(req =>
            `"${req.name}","${req.symptoms}","${req.department}","${req.priority}","${req.status}","${req.date1}"`
        ).join("\n");

        const blob = new Blob([headers + csvData], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nexus-triage-logs-${new Date().toLocaleDateString()}.csv`;
        a.click();
    };

    return (
        <div className="min-h-screen p-8 flex flex-col items-center">
            <div className="w-full max-w-7xl">
                <div className="flex justify-between items-center mb-6">
                    <Link href="/" className="text-gray-400 hover:text-white">&larr; Back to Hub</Link>
                    <h1 className="text-3xl font-bold text-white tracking-tight">AI Command Center</h1>
                    <div className="w-24"></div>
                </div>

                {/* ========================================= */}
                {/* AI PREDICTIVE ALLOCATION ENGINE (NEW) */}
                {/* ========================================= */}
                <div className={`glass-card mb-8 p-6 border-l-4 transition-all duration-500 ${surgeActive ? 'border-l-purple-500 bg-purple-900/20' : 'border-l-blue-500 bg-blue-900/10'}`}>
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className={`text-xl font-bold mb-2 flex items-center gap-2 ${surgeActive ? 'text-purple-400' : 'text-blue-400'}`}>
                                🧠 Nexus AI Allocator
                                {surgeActive && <span className="flex h-3 w-3 relative ml-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span></span>}
                            </h2>
                            {surgeActive ? (
                                <div className="space-y-2">
                                    <p className="text-white font-semibold">⚠️ SURGE PREDICTED: Multiple high-priority trauma cases detected. Mass casualty event likely.</p>
                                    <ul className="text-sm text-gray-300 space-y-1 ml-4 list-disc marker:text-purple-500">
                                        {/* IDEA 1: STAFF BALANCING */}
                                        <li><strong className="text-white">Staff Reallocation:</strong> Auto-reassigned 3 General Ward doctors to Trauma Department.</li>
                                        <li><strong className="text-white">Routine Queue:</strong> All non-essential appointments paused to conserve resources.</li>
                                    </ul>
                                </div>
                            ) : (
                                <p className="text-gray-300 text-sm">System stable. Predicted inflow matches current resource capacity. No reallocations required.</p>
                            )}
                        </div>
                    </div>
                    {/* IDEA 3: BED CONVERSION LOGS */}
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
                                    const isEmergency = req.priority === "High";
                                    return (
                                        <tr key={req.id} className={`${isEmergency && req.status === "Pending" ? "bg-red-900/20 animate-pulse border-l-4 border-l-red-500" : "hover:bg-white/5"} transition-colors`}>
                                            <td className="p-5">
                                                <p className={`font-bold text-base ${isEmergency ? "text-red-400" : "text-white"}`}>{req.name}</p>
                                                <p className="text-xs text-gray-500 mt-1">{req.date1}</p>
                                            </td>
                                            <td className="p-5 text-gray-300">
                                                <p className="whitespace-normal max-w-xs font-semibold text-white">{req.symptoms}</p>
                                                {req.originalText && (
                                                    <p className="text-xs text-gray-400 mt-2 italic bg-black/30 p-2 rounded whitespace-normal">
                                                        🎤 "{req.originalText}"
                                                    </p>
                                                )}
                                                {req.mapLink && (
                                                    <a href={req.mapLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-3 px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/50 rounded-md text-xs font-bold hover:bg-red-500/40 transition-all shadow-[0_0_10px_rgba(239,68,68,0.3)]">
                                                        📍 View GPS Coordinates
                                                    </a>
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
                                                        {/* IDEA 1 LINKED: During a surge, only allow Trauma assignments */}
                                                        <select
                                                            className="bg-black/50 border border-gray-700 text-gray-300 text-sm rounded-md p-2 outline-none"
                                                            value={selectedDepts[req.id] || (isEmergency ? "Trauma" : "General")}
                                                            onChange={(e) => setSelectedDepts({ ...selectedDepts, [req.id]: e.target.value })}
                                                            disabled={surgeActive && !isEmergency}
                                                        >
                                                            {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                                                        </select>
                                                        <button
                                                            onClick={() => forwardToDoctor(req.id, isEmergency)}
                                                            className={`${isEmergency ? "bg-red-600 hover:bg-red-500" : "bg-blue-600 hover:bg-blue-500"} ${surgeActive && !isEmergency ? "opacity-50 cursor-not-allowed" : ""} text-white px-4 py-2 rounded-md font-medium transition-colors`}
                                                            disabled={surgeActive && !isEmergency}
                                                        >
                                                            {isEmergency ? "Dispatch" : (surgeActive ? "Paused" : "Forward")}
                                                        </button>
                                                        <button onClick={exportToCSV} className="bg-white/10 hover:bg-white/20 text-white text-sm px-4 py-2 rounded border border-white/20 transition-all">
                                                            📥 Export Daily Logs
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                                {requests.length === 0 && !loading && (
                                    <tr><td colSpan={4} className="p-12 text-center text-gray-500 font-mono">No active requests in queue.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}