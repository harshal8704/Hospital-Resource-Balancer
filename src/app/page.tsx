"use client";

import { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function PatientIntake() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [date1, setDate1] = useState("");
  const [date2, setDate2] = useState("");
  const [imageBase64, setImageBase64] = useState("");

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await addDoc(collection(db, "patients"), {
        name,
        symptoms,
        date1,
        date2,
        imageBase64,
        status: "Pending",
        priorityScore: 5, // Default web intake to Routine (P5)
        department: "General", // Default assignment
        timestamp: new Date(),
      });

      setSuccess(true);
      setTimeout(() => {
        router.push("/");
      }, 3000);
    } catch (error) {
      console.error("Error adding document: ", error);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-teal-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <Link href="/" className="absolute top-8 left-8 text-gray-500 hover:text-white transition-colors z-20">
        &larr; Back to Hub
      </Link>

      <div className="w-full max-w-2xl z-10 animate-fade-in">

        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white tracking-tight mb-2">Patient Intake Form</h1>
          <p className="text-gray-400 font-light">Submit your symptoms for admin review and scheduling.</p>
        </div>

        {success ? (
          <div className="glass-card p-12 text-center border-teal-500/50 shadow-[0_0_30px_rgba(20,184,166,0.2)]">
            <div className="w-16 h-16 bg-teal-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-teal-500/50">
              <svg className="w-8 h-8 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Intake Received</h2>
            <p className="text-gray-400">Your request has been securely forwarded to the hospital triage center. Redirecting to hub...</p>
          </div>
        ) : (
          <div className="glass-card p-8 sm:p-10 shadow-2xl border-white/5">
            <form onSubmit={handleSubmit} className="space-y-6">

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-black/40 border border-gray-700 rounded-lg p-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                />
              </div>

              {/* Symptoms */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Describe Symptoms</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Please describe what you are experiencing..."
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  className="w-full bg-black/40 border border-gray-700 rounded-lg p-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all resize-none"
                />
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Upload Image of Symptom (Optional)</label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-700 border-dashed rounded-lg cursor-pointer bg-black/20 hover:bg-black/40 hover:border-teal-500/50 transition-all">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <svg className="w-8 h-8 mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                      <p className="text-sm text-gray-400"><span className="font-semibold text-teal-400">Click to upload</span> or drag and drop</p>
                    </div>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                  </label>
                </div>
                {imageBase64 && <p className="text-xs text-teal-400 mt-2 font-medium">✓ Image attached successfully</p>}
              </div>

              {/* Dates Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Preferred Date 1</label>
                  <input
                    type="date"
                    required
                    value={date1}
                    onChange={(e) => setDate1(e.target.value)}
                    className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-gray-300 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Preferred Date 2</label>
                  <input
                    type="date"
                    required
                    value={date2}
                    onChange={(e) => setDate2(e.target.value)}
                    className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-gray-300 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all [color-scheme:dark]"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-4 mt-4 rounded-lg font-bold text-white transition-all ${loading ? 'bg-gray-600 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-500 shadow-[0_0_20px_rgba(20,184,166,0.3)] hover:shadow-[0_0_30px_rgba(20,184,166,0.5)]'}`}
              >
                {loading ? "Securely Transmitting..." : "Submit Request"}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}