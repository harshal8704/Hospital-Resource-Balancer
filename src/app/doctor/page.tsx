"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
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
    priorityScore?: number;
    assignedBed?: string;
    patientEmail?: string; // NEW: Added to track the patient's Google email
};

// The Hardcoded Roster (Used to seed the database once)
const HOSPITAL_ROSTER = [
    { name: "Dr. Vance", email: "dr.vance@ycce.in", password: "drvance@trauma", baseDept: "Trauma" },
    { name: "Dr. Cole", email: "dr.cole@ycce.in", password: "drcole@trauma", baseDept: "Trauma" },
    { name: "Dr. Hayes", email: "dr.hayes@ycce.in", password: "drhayes@cardiology", baseDept: "Cardiology" },
    { name: "Dr. Brooks", email: "dr.brooks@ycce.in", password: "drbrooks@neurology", baseDept: "Neurology" },
    { name: "Dr. Smith", email: "dr.smith@ycce.in", password: "drsmith@orthopedics", baseDept: "Orthopedics" },
    { name: "Dr. Lin", email: "dr.lin@ycce.in", password: "drlin@general", baseDept: "General" },
    { name: "Dr. Patel", email: "dr.patel@ycce.in", password: "drpatel@general", baseDept: "General" },
];

export default function DoctorPortal() {
    const [email, setEmail] = useState("dr.vance@ycce.in");
    const [password, setPassword] = useState("drvance@trauma");

    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loginError, setLoginError] = useState("");
    const [isAuthenticating, setIsAuthenticating] = useState(false);

    // Doctor's specific profile loaded from DB
    const [doctorProfile, setDoctorProfile] = useState({ name: "", department: "" });

    const [patients, setPatients] = useState<PatientRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasEmergency, setHasEmergency] = useState(false);

    // Track the selected time for routine appointments
    const [appointmentTimes, setAppointmentTimes] = useState<Record<string, string>>({});

    const seedDatabase = async () => {
        try {
            for (const docData of HOSPITAL_ROSTER) {
                await setDoc(doc(db, "doctors", docData.email), docData);
            }
            alert("✅ Database Successfully Seeded with 7 Doctors! You can now log in.");
        } catch (error) {
            console.error("Error seeding DB:", error);
            alert("Error seeding database. Check console.");
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsAuthenticating(true);
        setLoginError("");

        try {
            const docRef = doc(db, "doctors", email.toLowerCase());
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.password === password) {
                    setDoctorProfile({ name: data.name, department: data.baseDept });
                    setIsAuthenticated(true);
                } else {
                    setLoginError("Invalid password.");
                }
            } else {
                setLoginError("Email not found in hospital directory.");
            }
        } catch (error) {
            console.error("Login error:", error);
            setLoginError("Server error verifying credentials.");
        }

        setIsAuthenticating(false);
    };

    useEffect(() => {
        if (isAuthenticated && doctorProfile.department) {
            setLoading(true);

            // Fetch BOTH active emergencies and routine appointments awaiting scheduling
            const q = query(collection(db, "patients"), where("status", "in", ["Active Deployment", "Awaiting Doctor Confirmation"]));

            const unsubscribe = onSnapshot(q, (querySnapshot) => {
                const data: PatientRequest[] = [];
                let emergencyDetected = false;

                querySnapshot.forEach((document) => {
                    const patientData = { id: document.id, ...document.data() } as PatientRequest;
                    if (patientData.department === doctorProfile.department) {
                        data.push(patientData);
                        if (patientData.priorityScore && patientData.priorityScore <= 2) {
                            emergencyDetected = true;
                        }
                    }
                });

                data.sort((a, b) => (a.priorityScore || 5) - (b.priorityScore || 5));
                setPatients(data);
                setHasEmergency(emergencyDetected);
                setLoading(false);
            });

            return () => unsubscribe();
        }
    }, [isAuthenticated, doctorProfile.department]);

    useEffect(() => {
        if (hasEmergency) {
            const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
            audio.play().catch(e => console.log("Audio play blocked until interaction"));

            const msg = new SpeechSynthesisUtterance(`Code Red. Priority 1 Trauma Patient Inbound to ${doctorProfile.department} wing.`);
            msg.rate = 0.9;
            msg.pitch = 1.2;

            setTimeout(() => {
                window.speechSynthesis.speak(msg);
            }, 1000);
        }
    }, [hasEmergency, doctorProfile.department]);

    // Utility to format 24h input to 12h AM/PM
    const formatTime = (time24: string) => {
        if (!time24) return "";
        const [hours, minutes] = time24.split(":");
        const h = parseInt(hours, 10);
        const ampm = h >= 12 ? "PM" : "AM";
        const formattedH = h % 12 || 12;
        return `${formattedH}:${minutes} ${ampm}`;
    };

    // NEW: Updated to take the entire patient object and trigger the email API
    const confirmAppointment = async (patient: PatientRequest, selectedDate: string, rawTime: string, isEmergency: boolean) => {
        try {
            if (isEmergency) {
                // Emergency patients stay as "Active Deployment" for the Admin to monitor
                alert("Emergency Patient Acknowledged. Proceed to the receiving bay immediately.");
            } else {
                // Routine Patients get scheduled and pushed back to the Admin Dashboard
                const formattedTime = formatTime(rawTime);
                const finalDateString = `${selectedDate} at ${formattedTime}`;

                // 1. Update Firebase
                await updateDoc(doc(db, "patients", patient.id), {
                    status: `Confirmed`, // Triggers the Admin filter
                    confirmedDate: finalDateString, // Sorts perfectly on Admin page
                });

                // 2. TRIGGER THE AUTOMATED EMAIL
                if (patient.patientEmail) {
                    try {
                        await fetch('/api/send-email', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                email: patient.patientEmail,
                                name: patient.name,
                                date: finalDateString,
                                doctor: doctorProfile.name
                            })
                        });
                        alert(`Appointment Confirmed. Notification email sent to ${patient.patientEmail}`);
                    } catch (emailError) {
                        console.error("Failed to send email:", emailError);
                        alert("Appointment Confirmed, but the email notification failed to send.");
                    }
                } else {
                    alert("Appointment Confirmed. (No email on file for this patient).");
                }
            }
        } catch (error) {
            console.error("Error updating document: ", error);
        }
    };

    if (!isAuthenticated) {
        return (
            <main className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none"></div>

                <button onClick={seedDatabase} className="absolute top-8 right-8 text-[10px] text-gray-500 hover:text-emerald-400 font-mono border border-gray-700 hover:border-emerald-500 px-2 py-1 rounded transition-colors z-20">
                    [1-CLICK: SEED DATABASE]
                </button>

                <Link href="/" className="absolute top-8 left-8 text-gray-500 hover:text-white transition-colors z-20">&larr; Hub</Link>

                <div className="glass-card p-10 w-full max-w-md shadow-2xl border-white/5 animate-fade-in z-10">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 mx-auto border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                        <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                    </div>
                    <h1 className="text-2xl font-bold mb-2 text-center text-white tracking-tight">Physician Login</h1>
                    <p className="text-gray-400 text-sm mb-8 text-center font-light">Secure enterprise portal.</p>

                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Institutional Email</label>
                            <input type="email" required
                                className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                                value={email} onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Password</label>
                            <input type="password" required
                                className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                                value={password} onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        {loginError && <p className="text-red-400 text-xs bg-red-400/10 p-2 rounded border border-red-400/20">{loginError}</p>}

                        <button type="submit" disabled={isAuthenticating} className={`w-full font-bold py-3.5 px-4 rounded-lg transition-all mt-4 text-white ${isAuthenticating ? 'bg-gray-600' : 'bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]'}`}>
                            {isAuthenticating ? "Authenticating..." : "Sign In"}
                        </button>
                    </form>
                </div>
            </main>
        );
    }

    return (
        <div className={`min-h-screen p-8 flex flex-col items-center transition-all duration-1000 ${hasEmergency ? 'bg-red-950/20 shadow-[inset_0_0_150px_rgba(220,38,38,0.15)]' : ''}`}>
            <div className="w-full max-w-6xl">
                <div className="flex justify-between items-end mb-6 border-b border-white/10 pb-6">
                    <div>
                        <span className={`text-sm font-bold tracking-widest uppercase mb-1 block ${hasEmergency ? 'text-red-500' : 'text-emerald-400'}`}>{doctorProfile.department} WING</span>
                        <h1 className="text-4xl font-bold tracking-tight text-white">Assigned Caseload</h1>
                    </div>
                    <div className="text-right">
                        <p className="text-lg text-white font-bold mb-1">{doctorProfile.name}</p>
                        <button onClick={() => setIsAuthenticated(false)} className="text-xs font-medium text-gray-500 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded transition-all">
                            Sign Out
                        </button>
                    </div>
                </div>

                {hasEmergency && (
                    <div className="mb-8 bg-red-600/20 border border-red-500 p-6 rounded-lg animate-pulse">
                        <h2 className="text-2xl font-bold text-red-500 flex items-center gap-3">
                            🚨 CODE RED: TRAUMA INBOUND
                        </h2>
                        <p className="text-red-200 mt-2 font-medium">An emergency patient has been routed to your queue. Prepare receiving bay immediately.</p>
                    </div>
                )}

                {loading ? (
                    <div className="text-center text-gray-400 mt-20 animate-pulse font-mono">Syncing live dashboard...</div>
                ) : patients.length === 0 ? (
                    <div className="glass-card p-16 text-center border-dashed border-2 border-white/5">
                        <h3 className="text-2xl font-semibold text-gray-300 mb-2">Queue Empty</h3>
                        <p className="text-gray-500">No active deployments routed to your station.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {patients.map((patient) => {
                            const isHighPriority = patient.priorityScore && patient.priorityScore <= 2;
                            const timeValue = appointmentTimes[patient.id] || "";

                            return (
                                <div key={patient.id} className={`glass-card overflow-hidden group hover:border-white/10 transition-colors ${isHighPriority ? 'border-red-500/50 shadow-[0_0_20px_rgba(220,38,38,0.2)]' : ''}`}>
                                    <div className={`h-2 w-full ${isHighPriority ? 'bg-gradient-to-r from-red-600 to-red-400 animate-pulse' : 'bg-gradient-to-r from-emerald-500 to-teal-400'}`}></div>
                                    <div className="p-6">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <div className="flex items-center gap-3">
                                                    <h2 className={`text-2xl font-bold mb-1 ${isHighPriority ? 'text-red-400' : 'text-white'}`}>{patient.name}</h2>
                                                    {patient.priorityScore && (
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${isHighPriority ? 'bg-red-500/20 text-red-400 border-red-500/50' : 'bg-gray-500/20 text-gray-400 border-gray-500/50'}`}>
                                                            P{patient.priorityScore}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className={`inline-flex items-center px-2 py-1 mt-1 rounded text-xs font-bold uppercase tracking-wider ${isHighPriority ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                                    {isHighPriority ? "IMMEDIATE ATTENTION REQUIRED" : "Awaiting Schedule"}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="mb-8 bg-black/40 p-4 rounded-lg border border-white/5">
                                            <div className="flex justify-between mb-2">
                                                <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Chief Complaint</span>
                                                {patient.assignedBed && patient.assignedBed !== "Outpatient (OPD)" && (
                                                    <span className="text-xs font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">LOC: {patient.assignedBed}</span>
                                                )}
                                            </div>
                                            <p className={`text-sm leading-relaxed ${isHighPriority ? 'text-red-200 font-medium' : 'text-gray-300'}`}>{patient.symptoms}</p>
                                        </div>

                                        {/* DYNAMIC ACTION REQUIRED SECTION */}
                                        <div>
                                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-3">Action Required</p>

                                            {isHighPriority ? (
                                                <button
                                                    onClick={() => confirmAppointment(patient, "N/A", "N/A", true)}
                                                    className="w-full border text-white text-sm py-3 px-4 rounded-lg transition-all font-bold bg-red-600 hover:bg-red-500 border-red-500 shadow-lg shadow-red-900/50"
                                                >
                                                    Acknowledge & Receive Patient
                                                </button>
                                            ) : (
                                                <div className="space-y-3">
                                                    {/* Time Selector */}
                                                    <div className="flex items-center gap-3 bg-black/30 p-3 rounded-lg border border-white/5">
                                                        <label className="text-xs text-gray-400 font-bold uppercase tracking-wider w-24">Set Time:</label>
                                                        <input
                                                            type="time"
                                                            className="bg-black/50 border border-gray-700 rounded p-2 text-white text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 flex-1 [color-scheme:dark]"
                                                            value={timeValue}
                                                            onChange={(e) => setAppointmentTimes({ ...appointmentTimes, [patient.id]: e.target.value })}
                                                        />
                                                    </div>

                                                    {/* Date Selectors */}
                                                    <div className="flex gap-3">
                                                        <button
                                                            onClick={() => confirmAppointment(patient, patient.date1, timeValue, false)}
                                                            disabled={!timeValue}
                                                            className={`flex-1 border text-sm py-3 px-2 rounded-lg transition-all font-bold ${!timeValue ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed' : 'bg-white/5 text-emerald-400 hover:bg-emerald-600/20 border-emerald-500/30 hover:border-emerald-500'}`}
                                                        >
                                                            Confirm: {patient.date1}
                                                        </button>
                                                        {patient.date2 && (
                                                            <button
                                                                onClick={() => confirmAppointment(patient, patient.date2, timeValue, false)}
                                                                disabled={!timeValue}
                                                                className={`flex-1 border text-sm py-3 px-2 rounded-lg transition-all font-bold ${!timeValue ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed' : 'bg-white/5 text-emerald-400 hover:bg-emerald-600/20 border-emerald-500/30 hover:border-emerald-500'}`}
                                                            >
                                                                Confirm: {patient.date2}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
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