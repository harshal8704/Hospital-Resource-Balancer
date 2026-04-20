"use client";

import { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

export default function PatientPortal() {
    const [formData, setFormData] = useState({
        name: "",
        symptoms: "",
        date1: "",
        date2: "",
        imageBase64: "",
    });
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    // Convert uploaded image to Base64 string
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData({ ...formData, imageBase64: reader.result as string });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Save data directly to Firestore "patients" collection
            await addDoc(collection(db, "patients"), {
                ...formData,
                status: "Pending", // Admin needs to review this
                timestamp: new Date(),
            });
            setSuccess(true);
            setFormData({ name: "", symptoms: "", date1: "", date2: "", imageBase64: "" });
        } catch (error) {
            console.error("Error saving document: ", error);
            alert("Failed to submit. Check console.");
        }

        setLoading(false);
    };

    return (
        <div className="min-h-screen p-8 sm:p-20 flex flex-col items-center">
            <div className="w-full max-w-2xl">
                <Link href="/" className="text-gray-400 hover:text-white mb-8 inline-block">&larr; Back to Hub</Link>

                <div className="glass-card p-8">
                    <h1 className="text-3xl font-bold mb-2">Patient Intake Form</h1>
                    <p className="text-gray-400 mb-8">Submit your symptoms for admin review and scheduling.</p>

                    {success ? (
                        <div className="bg-green-500/20 border border-green-500/50 text-green-400 p-4 rounded-md mb-6">
                            Request submitted successfully! The admin will review your case.
                        </div>
                    ) : null}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Full Name</label>
                            <input required type="text"
                                className="w-full bg-black/50 border border-gray-700 rounded-md p-3 text-white focus:outline-none focus:border-blue-500"
                                value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Describe Symptoms</label>
                            <textarea required rows={4}
                                className="w-full bg-black/50 border border-gray-700 rounded-md p-3 text-white focus:outline-none focus:border-blue-500"
                                value={formData.symptoms} onChange={(e) => setFormData({ ...formData, symptoms: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Upload Image of Symptom (Optional)</label>
                            <input type="file" accept="image/*" onChange={handleImageUpload}
                                className="w-full bg-black/50 border border-gray-700 rounded-md p-2 text-white file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                            />
                            {formData.imageBase64 && <p className="text-xs text-green-400 mt-2">Image attached successfully.</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Preferred Date 1</label>
                                <input required type="date"
                                    className="w-full bg-black/50 border border-gray-700 rounded-md p-3 text-white focus:outline-none focus:border-blue-500"
                                    value={formData.date1} onChange={(e) => setFormData({ ...formData, date1: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Preferred Date 2</label>
                                <input required type="date"
                                    className="w-full bg-black/50 border border-gray-700 rounded-md p-3 text-white focus:outline-none focus:border-blue-500"
                                    value={formData.date2} onChange={(e) => setFormData({ ...formData, date2: e.target.value })}
                                />
                            </div>
                        </div>

                        <button type="submit" disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:opacity-50">
                            {loading ? "Submitting..." : "Submit Request"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}