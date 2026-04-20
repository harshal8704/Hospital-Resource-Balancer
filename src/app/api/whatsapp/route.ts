import fs from "fs";
import path from "path";
import os from "os";
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { collection, addDoc, query, where, getDocs, updateDoc, doc, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function POST(req: Request) {
    console.log("====================================");
    console.log("1. Webhook Triggered by Twilio!");

    try {
        if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY missing");
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

        const text = await req.text();
        const params = new URLSearchParams(text);

        const senderNumber = params.get("From") || "Unknown";
        const incomingMessage = params.get("Body") || "";

        // Check for Attachments
        const numMedia = parseInt(params.get("NumMedia") || "0");
        const mediaUrl = numMedia > 0 ? params.get("MediaUrl0") : null;
        const latitude = params.get("Latitude");
        const longitude = params.get("Longitude");

        // ==========================================
        // SCENARIO A: PATIENT SENT A LOCATION
        // ==========================================
        if (latitude && longitude) {
            console.log(`📍 Location received: ${latitude}, ${longitude}`);

            const q = query(
                collection(db, "patients"),
                where("phone", "==", senderNumber),
                orderBy("timestamp", "desc"),
                limit(1)
            );
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const patientDoc = snapshot.docs[0];
                // Replace this block in Scenario A
                await updateDoc(doc(db, "patients", patientDoc.id), {
                    locationStr: `${latitude},${longitude}`,
                    mapLink: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
                });

                return new NextResponse(
                    `<Response><Message>📍 Location acquired. Ambulance is routing to your exact coordinates.</Message></Response>`,
                    { headers: { "Content-Type": "text/xml" } }
                );
            } else {
                return new NextResponse(
                    `<Response><Message>📍 Location received, but no active emergency ticket found. Please send a voice note first.</Message></Response>`,
                    { headers: { "Content-Type": "text/xml" } }
                );
            }
        }

        // ==========================================
        // SCENARIO B: PATIENT SENT AUDIO (OR TEXT)
        // ==========================================
        let patientText = incomingMessage;

        if (mediaUrl) {
            console.log("🎤 Audio Voice Note Detected! Forcing Twilio download...");

            // SECURITY BYPASS: Send Twilio Account SID and Auth Token
            if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
                throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in .env.local!");
            }

            const twilioAuth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');

            const audioRes = await fetch(mediaUrl, {
                headers: {
                    'Authorization': `Basic ${twilioAuth}`
                }
            });

            if (!audioRes.ok) {
                console.error(`❌ Twilio Download Blocked! Status: ${audioRes.status}`);
                throw new Error("Failed to download audio from Twilio despite Auth.");
            }

            console.log("✅ Download successful! Converting file...");
            const arrayBuffer = await audioRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const tempFilePath = path.join(os.tmpdir(), `whatsapp-audio-${Date.now()}.ogg`);
            fs.writeFileSync(tempFilePath, buffer);

            console.log("🧠 Transcribing Multilingual Audio via Whisper...");
            const transcription = await groq.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: "whisper-large-v3",
                response_format: "json",
            });

            patientText = transcription.text;
            console.log("✅ Transcription result:", patientText);

            fs.unlinkSync(tempFilePath);
        }

        if (!patientText || patientText.trim() === "") {
            return new NextResponse(`<Response><Message>We received an empty message.</Message></Response>`, { headers: { "Content-Type": "text/xml" } });
        }

        // ==========================================
        // AI TRIAGE (LLAMA 3)
        // ==========================================
        console.log("3. Triage AI Processing...");
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Extract symptoms, department ("General", "Cardiology", "Neurology", "Orthopedics", "Trauma"), and assign a priorityScore from 1 to 5 (1 = Critical Life-Threatening Emergency, 2 = Urgent, 3 = Moderate, 4 = Minor, 5 = Routine). Output strict JSON only. Example: {"symptoms": "broken bone", "department": "Orthopedics", "priorityScore": 2}`
                },
                { role: "user", content: patientText }
            ],
            model: "llama-3.1-8b-instant",
            temperature: 0.1,
        });

        let aiResponse = chatCompletion.choices[0]?.message?.content || "{}";
        aiResponse = aiResponse.replace(/```json/g, "").replace(/```/g, "").trim();
        const triageData = JSON.parse(aiResponse);

        // Priority 1 and 2 trigger the Emergency Protocols
        const priorityNumber = triageData.priorityScore || 5;
        const isEmergency = priorityNumber <= 2;

        console.log("4. Saving to Firebase with Priority:", priorityNumber);
        await addDoc(collection(db, "patients"), {
            phone: senderNumber,
            name: isEmergency ? `🚨 AUDIO EMERGENCY` : `WhatsApp User`,
            symptoms: triageData.symptoms || patientText,
            originalText: patientText,
            department: triageData.department || "Trauma",
            date1: isEmergency ? "IMMEDIATE" : "Pending",
            date2: isEmergency ? "IMMEDIATE" : "Pending",
            status: "Pending",
            priorityScore: priorityNumber, // Save the number instead of text
            timestamp: new Date(),
            mapLink: null
        });

        // ==========================================
        // GENERATE REPLY
        // ==========================================
        let replyText = `🏥 *NexusHealth AI*\nWe transcribed your message: "${patientText}"\nSymptoms logged: ${triageData.symptoms}.`;

        if (isEmergency) {
            replyText += `\n\n🚨 *PRIORITY 1 DETECTED*\nYour case is flagged for the ${triageData.department} unit.\n\n📍 *PLEASE SEND YOUR WHATSAPP LIVE LOCATION NOW* so we can dispatch the ambulance.`;
        }

        console.log("====================================");
        return new NextResponse(`<Response><Message>${replyText}</Message></Response>`, {
            headers: { "Content-Type": "text/xml" },
        });

    } catch (error: any) {
        console.error("❌ WEBHOOK CRASHED:", error.message);
        return new NextResponse(`<Response><Message>Error processing request. Please type your emergency.</Message></Response>`, { headers: { "Content-Type": "text/xml" } });
    }
}