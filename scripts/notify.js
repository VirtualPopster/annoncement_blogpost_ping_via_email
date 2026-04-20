const { Groq } = require('groq-sdk');
const { Resend } = require('resend');
const axios = require('axios');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);
const OWNER = 'VirtualPopster';
const REPO = 'annoncement_blogpost_ping_via_email';
const TOKEN = process.env.GITHUB_TOKEN;

async function run() {
    try {
        // 1. Get the latest post issue
        const postsRes = await axios.get(`https://api.github.com/repos/${OWNER}/${REPO}/issues?labels=post&state=open`, {
            headers: { 'Authorization': `token ${TOKEN}` }
        });
        const latestPost = postsRes.data[0];
        if (!latestPost) return console.log("No posts found.");

        // 2. Get subscribers
        const subsRes = await axios.get(`https://api.github.com/repos/${OWNER}/${REPO}/issues?labels=system_subs`, {
            headers: { 'Authorization': `token ${TOKEN}` }
        });
        const subscribers = JSON.parse(subsRes.data[0].body || "[]");
        if (subscribers.length === 0) return console.log("No subscribers.");

        console.log(`Drafting AI summary for: ${latestPost.title}`);

        // 3. Draft AI Summary via Groq
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a professional blog editor. Create a catchy email subject and a professional 3-sentence summary for a new blog post. Format your response as JSON: { \"subject\": \"...\", \"summary\": \"...\", \"image_prompt\": \"...\" }. The image_prompt should describe a professional illustration."
                },
                {
                    role: "user",
                    content: `Title: ${latestPost.title}\nContent: ${latestPost.body}`
                }
            ],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" }
        });

        const aiDraft = JSON.parse(chatCompletion.choices[0].message.content);
        const illustrationUrl = `https://pollinations.ai/p/${encodeURIComponent(aiDraft.image_prompt)}?width=1024&height=1024&nologo=true`;

        // 4. Send Emails
        console.log(`Sending to ${subscribers.length} subscribers...`);
        const { data, error } = await resend.emails.send({
            from: 'AI Blog <onboarding@resend.dev>',
            to: subscribers,
            subject: aiDraft.subject,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 20px;">
                    <img src="${illustrationUrl}" style="width: 100%; border-radius: 15px; margin-bottom: 20px;">
                    <h1 style="color: #111;">${aiDraft.subject}</h1>
                    <p style="color: #444; font-size: 16px; line-height: 1.6;">${aiDraft.summary}</p>
                    <a href="https://${OWNER}.github.io/${REPO}/site-x/" style="display: inline-block; background: black; color: white; padding: 12px 25px; border-radius: 10px; text-decoration: none; font-weight: bold; margin-top: 20px;">Read Full Story</a>
                </div>
            `
        });

        if (error) console.error("Resend Error:", error);
        else console.log("Notification sent!", data.id);

    } catch (err) { console.error("Automation failed:", err); }
}

run();
