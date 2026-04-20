import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request: Request) {
    try {
        const { email, name, date, doctor } = await request.json();

        // 1. Configure the Gmail Transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        // 2. The Premium Hospital HTML Email Template
        const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-w: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div style="background-color: #0d0d0f; padding: 24px; text-align: center; border-bottom: 3px solid #10b981;">
                    <h1 style="color: #ffffff; margin: 0; letter-spacing: -0.5px;">Nexus<span style="color: #10b981;">Health</span></h1>
                    <p style="color: #9ca3af; margin-top: 5px; font-size: 14px;">Appointment Confirmation</p>
                </div>
                <div style="padding: 32px; background-color: #ffffff; color: #374151;">
                    <h2 style="color: #111827; margin-top: 0;">Hello ${name},</h2>
                    <p style="font-size: 16px; line-height: 1.5;">Your medical intake request has been reviewed and officially approved by our staff.</p>
                    
                    <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #10b981;">
                        <p style="margin: 0 0 10px 0;"><strong>👨‍⚕️ Attending Physician:</strong> ${doctor}</p>
                        <p style="margin: 0;"><strong>📅 Confirmed Schedule:</strong> ${date}</p>
                    </div>
                    
                    <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">Please arrive 10 minutes prior to your scheduled time. If this is a medical emergency, please disregard this notice and dial emergency services immediately.</p>
                </div>
                <div style="background-color: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #9ca3af;">
                    &copy; ${new Date().getFullYear()} NexusHealth Enterprise Triage System. Automated Dispatch.
                </div>
            </div>
        `;

        // 3. Send the Email
        await transporter.sendMail({
            from: `"NexusHealth Command" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Confirmed: Your Medical Appointment with ${doctor}`,
            html: htmlContent,
        });

        return NextResponse.json({ success: true, message: 'Email dispatched successfully' });

    } catch (error) {
        console.error('Email Dispatch Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to send email' }, { status: 500 });
    }
}