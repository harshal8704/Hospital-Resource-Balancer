"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";
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
    department: string;
    priority?: string;
};

const SPECIALTIES = ["General", "Cardiology", "Neurology", "Orthopedics", "Trauma"];

export default function DoctorPortal() {
    const [email, setEmail] = useState("");
    const [department, setDepartment] = useState("General");
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loginError, setLoginError] = useState("");

    const [patients, setPatients] = useState<PatientRequest[]>([]);
    const [loading, setLoading] = useState(false);

    // NEW: Track if there is an active emergency for this doctor
    const [hasEmergency, setHasEmergency] = useState(false);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (email.toLowerCase().endsWith("@ycce.in")) {
            setIsAuthenticated(true);
            setLoginError("");
        } else {
            setLoginError("Access Denied. Strict @ycce.in domain policy active.");
        }
    };

    useEffect(() => {
        if (isAuthenticated) {
            setLoading(true);
            const q = query(collection(db, "patients"), where("status", "==", "Forwarded to Doctor"));

            const unsubscribe = onSnapshot(q, (querySnapshot) => {
                const data: PatientRequest[] = [];
                let emergencyDetected = false;

                querySnapshot.forEach((document) => {
                    const patientData = { id: document.id, ...document.data() } as PatientRequest;
                    if (patientData.department === department) {
                        data.push(patientData);
                        if (patientData.priority === "High") {
                            emergencyDetected = true;
                        }
                    }
                });

                // Sort to put emergencies first
                data.sort((a, b) => (a.priority === "High" ? -1 : 1));

                setPatients(data);
                setHasEmergency(emergencyDetected);
                setLoading(false);
            });

            return () => unsubscribe();
        }
    }, [isAuthenticated, department]);

    const confirmAppointment = async (id: string, selectedDate: string) => {
        try {
            await updateDoc(doc(db, "patients", id), {
                status: `Confirmed for ${selectedDate}`,
            });
        } catch (error) {
            console.error("Error updating document: ", error);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 relative">
                <Link href="/" className="text-gray-500 hover:text-white absolute top-8 left-8 transition-colors">&larr; Hub</Link>
                <div className="glass-card p-10 w-full max-w-md shadow-2xl shadow-green-900/10 animate-fade-in">
                    <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mb-6 mx-auto border border-green-500/20">
                        <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                    </div>
                    <h1 className="text-2xl font-bold mb-2 text-center text-white tracking-tight">Physician Authentication</h1>
                    <p className="text-gray-400 text-sm mb-8 text-center">Secure portal. Enterprise access only.</p>

                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Institutional Email</label>
                            <input type="email" placeholder="dr.smith@ycce.in" required
                                className="w-full bg-black/40 border border-gray-700 rounded-md p-3 text-white focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
                                value={email} onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Medical Department</label>
                            <select
                                className="w-full bg-black/40 border border-gray-700 rounded-md p-3 text-white focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all appearance-none"
                                value={department} onChange={(e) => setDepartment(e.target.value)}
                            >
                                {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        {loginError && <p className="text-red-400 text-xs bg-red-400/10 p-2 rounded border border-red-400/20">{loginError}</p>}
                        <button type="submit" className="w-full bg-green-600/90 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-md transition-all shadow-lg shadow-green-900/20 mt-4">
                            Authenticate
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        // If there is an emergency, the whole screen gets a pulsing red vignette
        <div className={`min-h-screen p-8 flex flex-col items-center transition-all duration-1000 ${hasEmergency ? 'bg-red-950/20 shadow-[inset_0_0_150px_rgba(220,38,38,0.15)]' : ''}`}>
            <div className="w-full max-w-6xl">
                <div className="flex justify-between items-end mb-6 border-b border-white/10 pb-6">
                    <div>
                        <span className={`text-sm font-bold tracking-widest uppercase mb-1 block ${hasEmergency ? 'text-red-500' : 'text-green-400'}`}>{department} Department</span>
                        <h1 className="text-4xl font-bold tracking-tight text-white">Assigned Caseload</h1>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-gray-400 mb-2">{email}</p>
                        <button onClick={() => setIsAuthenticated(false)} className="text-xs font-medium text-gray-500 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded transition-all">
                            End Session
                        </button>
                    </div>
                </div>

                {/* EMERGENCY BANNER */}
                {hasEmergency && (
                    <div className="mb-8 bg-red-600/20 border border-red-500 p-6 rounded-lg animate-pulse">
                        <h2 className="text-2xl font-bold text-red-500 flex items-center gap-3">
                            🚨 CODE RED: TRAUMA INBOUND
                        </h2>
                        <p className="text-red-200 mt-2 font-medium">An emergency patient has been routed to your department. Prepare receiving bay immediately.</p>
                    </div>
                )}

                {loading ? (
                    <div className="text-center text-gray-400 mt-20 animate-pulse font-mono">Syncing live dashboard...</div>
                ) : patients.length === 0 ? (
                    <div className="glass-card p-16 text-center border-dashed border-2 border-white/5">
                        <h3 className="text-2xl font-semibold text-gray-300 mb-2">Zero Pending Cases</h3>
                        <p className="text-gray-500">Administration has not assigned any new patients to the {department} wing.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {patients.map((patient) => {
                            const isHighPriority = patient.priority === "High";

                            return (
                                <div key={patient.id} className={`glass-card overflow-hidden group hover:border-white/10 transition-colors ${isHighPriority ? 'border-red-500/50 shadow-[0_0_20px_rgba(220,38,38,0.2)]' : ''}`}>
                                    <div className={`h-2 w-full ${isHighPriority ? 'bg-gradient-to-r from-red-600 to-red-400 animate-pulse' : 'bg-gradient-to-r from-green-500 to-emerald-400'}`}></div>
                                    <div className="p-6">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <h2 className={`text-2xl font-bold mb-1 ${isHighPriority ? 'text-red-400' : 'text-white'}`}>{patient.name}</h2>
                                                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${isHighPriority ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
                                                    {isHighPriority ? "IMMEDIATE ATTENTION REQUIRED" : "Awaiting Confirmation"}
                                                </span>
                                            </div>
                                            {patient.imageBase64 && (
                                                <img src={patient.imageBase64} alt="Symptom" className="h-16 w-16 object-cover rounded-lg border border-white/10 shadow-lg" />
                                            )}
                                        </div>

                                        <div className="mb-8 bg-black/40 p-4 rounded-lg border border-white/5">
                                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Chief Complaint</p>
                                            <p className={`text-sm leading-relaxed ${isHighPriority ? 'text-red-200 font-medium' : 'text-gray-300'}`}>{patient.symptoms}</p>
                                        </div>

                                        <div>
                                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-3">Action Required</p>
                                            <div className="flex gap-4">
                                                <button
                                                    onClick={() => confirmAppointment(patient.id, isHighPriority ? "Receiving Now" : patient.date1)}
                                                    className={`flex-1 border text-white text-sm py-3 px-4 rounded-md transition-all font-medium ${isHighPriority ? 'bg-red-600 hover:bg-red-500 border-red-500 shadow-lg shadow-red-900/50' : 'bg-white/5 hover:bg-green-600/90 border-white/10'}`}
                                                >
                                                    {isHighPriority ? "Acknowledge & Receive Patient" : `Confirm ${patient.date1}`}
                                                </button>
                                                {!isHighPriority && (
                                                    <button
                                                        onClick={() => confirmAppointment(patient.id, patient.date2)}
                                                        className="flex-1 bg-white/5 hover:bg-green-600/90 border border-white/10 text-white text-sm py-3 px-4 rounded-md transition-all font-medium"
                                                    >
                                                        Confirm {patient.date2}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}