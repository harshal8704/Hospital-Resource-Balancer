import fs from "fs";
import path from "path";
import os from "os";
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { collection, addDoc, query, where, getDocs, updateDoc, doc, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ==========================================
// THE MATH: HAVERSINE SPHERICAL DISTANCE
// ==========================================
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
}

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

        // Extract Patient Location
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

                // 1. Get Hospital Coordinates from .env.local
                const hospLat = parseFloat(process.env.NEXT_PUBLIC_HOSPITAL_LAT || "21.1255");
                const hospLng = parseFloat(process.env.NEXT_PUBLIC_HOSPITAL_LNG || "79.0984");

                // 2. Calculate Distance
                const patientLat = parseFloat(latitude);
                const patientLng = parseFloat(longitude);
                const distanceKm = calculateDistance(hospLat, hospLng, patientLat, patientLng);

                // 3. Calculate ETA (Assuming 40 km/h average urban ambulance speed + 3 min dispatch buffer)
                const speedKmph = 40;
                const timeHours = distanceKm / speedKmph;
                const timeMinutes = Math.ceil(timeHours * 60) + 3; // +3 mins for paramedics to board

                // 4. Update Database
                await updateDoc(doc(db, "patients", patientDoc.id), {
                    locationStr: `${latitude},${longitude}`,
                    mapLink: `http://googleusercontent.com/maps.google.com/?q=${latitude},${longitude}`,
                    distanceKm: distanceKm.toFixed(2),
                    etaMinutes: timeMinutes
                });

                // 5. Send Dynamic ETA Reply via WhatsApp
                const reply = `📍 *Target Locked*\nDistance: ${distanceKm.toFixed(1)} km from GMC Nagpur.\n\n🚑 *Ambulance Dispatched!*\nEstimated Time of Arrival: *${timeMinutes} Minutes*.\n\nPlease stay calm and keep your phone accessible. Paramedics are en route.`;

                return new NextResponse(
                    `<Response><Message>${reply}</Message></Response>`,
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
            priorityScore: priorityNumber,
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