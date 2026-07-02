const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { Client } = require('pg'); 
require('dotenv').config(); 

BigInt.prototype.toJSON = function() { return this.toString(); };

const connectionString = process.env.DATABASE_URL || "postgresql://postgres.dmmtxstoystqampadggp:Ilovegaming21@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// -------------------------------------------------------------
// CONFIGURATION DU CLIENT UNIQUE POSTGRESQL
// -------------------------------------------------------------
const client = new Client({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false 
    },
    connectionTimeoutMillis: 10000 
});

let isConnected = false;
async function connectDatabase() {
    if (!isConnected) {
        try {
            await client.connect();
            isConnected = true;
            console.log("🗄️ Connexion sécurisée à PostgreSQL opérationnelle.");
        } catch (err) {
            console.error("❌ Erreur de connexion PostgreSQL :", err.message);
        }
    }
}

// Création automatique des tables
const initDb = async () => {
    try {
        await connectDatabase();
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id bigint PRIMARY KEY,
                email TEXT UNIQUE,
                password TEXT,
                company TEXT
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS appointments (
                id bigint PRIMARY KEY,
                "userId" bigint,
                "clientName" TEXT,
                "clientEmail" TEXT,
                "dateTime" TEXT,
                status TEXT
            )
        `);
    } catch (err) {
        console.error("❌ Erreur lors de l'initialisation des tables :", err.message);
    }
};
initDb();

// -------------------------------------------------------------
// CONFIGURATION DE NODEMAILER
// -------------------------------------------------------------
let transporter;
async function initEmailTransporter() {
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        transporter = nodemailer.createTransport({
            service: 'gmail', 
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });
    } else {
        try {
            let testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email",
                port: 587,
                secure: false, 
                auth: { user: testAccount.user, pass: testAccount.pass },
            });
        } catch (err) {
            console.log("⚠️ Mode email dégradé (sans SMTP).");
        }
    }
}
initEmailTransporter();

function formatEmailDate(dateTimeStr, lang = 'fr') {
    if (!dateTimeStr) return '';
    const dateObj = new Date(dateTimeStr);
    const locale = lang === 'en' ? 'en-US' : 'fr-FR';
    return dateObj.toLocaleDateString(locale, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

function generateEmailTemplate(badgeText, badgeColor, title, description, detailsHtml) {
    const isSuccess = badgeColor === 'success';
    const gradient = isSuccess ? 'linear-gradient(135deg, #1e1b4b 0%, #2e1065 100%)' : 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)';
    const bColor = isSuccess ? '#34d399' : '#fca5a5';
    const bBg = isSuccess ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
    const bBorder = isSuccess ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';

    return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 40px 10px; color: #ffffff;">
        <div style="max-width: 550px; margin: 0 auto; background: ${gradient}; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.4);">
            <div style="font-size: 20px; font-weight: bold; color: #a5b4fc; margin-bottom: 24px; text-align: center;">📅 SaaS Appointment Manager</div>
            <div style="text-align: center; margin-bottom: 16px;">
                <span style="display: inline-block; background-color: ${bBg}; color: ${bColor}; border: 1px solid ${bBorder}; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600;">${badgeText}</span>
            </div>
            <h1 style="font-size: 24px; font-weight: 800; margin: 0 0 16px 0; color: #ffffff; text-align: center;">${title}</h1>
            <p style="font-size: 15px; color: #94a3b8; line-height: 1.6; margin: 0 0 20px 0; text-align: center;">${description}</p>
            <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                ${detailsHtml}
            </div>
        </div>
    </body>
    </html>
    `;
}

async function sendNotificationEmail(toEmail, subject, htmlContent) {
    try {
        if (!transporter) return;
        await transporter.sendMail({
            from: '"SaaS Appointment Manager" <noreply@saasappointment.com>',
            to: toEmail, subject: subject, html: htmlContent
        });
    } catch (error) {
        console.error("❌ Erreur email :", error);
    }
}

// ROUTE : CONNEXION
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        await connectDatabase();
        const result = await client.query("SELECT * FROM users WHERE LOWER(email) = LOWER($1)", [email]);
        const user = result.rows[0];
        if (!user || user.password !== password) {
            return res.status(400).json({ error: "Identifiants invalides." });
        }
        return res.json({ id: String(user.id), email: user.email, company: user.company });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ROUTE : INSCRIPTION
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Champs manquants." });
    const userId = Date.now(); 
    try {
        await connectDatabase();
        await client.query("INSERT INTO users (id, email, password, company) VALUES ($1, $2, $3, $4)", [userId, email, password, ""]);
        return res.status(201).json({ id: String(userId), email });
    } catch (err) {
        if (err.message.includes("unique") || err.code === '23505') {
            return res.status(400).json({ error: "Cet e-mail est déjà utilisé." });
        }
        return res.status(500).json({ error: err.message });
    }
});

// ROUTE : PROFIL
const handleProfileGet = async (req, res) => {
    const userId = req.query.userId || req.params.id;
    if (!userId) return res.status(400).json({ error: "userId requis." });
    try {
        await connectDatabase();
        const result = await client.query("SELECT id, email, company FROM users WHERE id = $1", [userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Utilisateur introuvable." });
        
        const user = result.rows[0];
        return res.json({ id: String(user.id), email: user.email, company: user.company, businessName: user.company });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

app.get('/api/profile', handleProfileGet);
app.get('/api/user/profile', handleProfileGet);
app.get('/api/user/:id', handleProfileGet);

app.post('/api/user/update', async (req, res) => {
    const { userId, company, password } = req.body;
    if (!userId) return res.status(400).json({ error: "ID Utilisateur manquant." });
    try {
        await connectDatabase();
        if (password) {
            await client.query("UPDATE users SET company = $1, password = $2 WHERE id = $3", [company, password, userId]);
        } else {
            await client.query("UPDATE users SET company = $1 WHERE id = $2", [company, userId]);
        }
        return res.json({ success: true, message: "Profil mis à jour." });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// CRÉER UN RENDEZ-VOUS
app.post('/api/appointments', async (req, res) => {
    const { userId, clientName, clientEmail, dateTime, status } = req.body;
    if (!userId || !clientName || !dateTime) return res.status(400).json({ error: "Champs manquants." });

    const apptId = Date.now();
    const finalStatus = status || "Pending";

    try {
        await connectDatabase();
        await client.query(
            `INSERT INTO appointments (id, "userId", "clientName", "clientEmail", "dateTime", status) VALUES ($1, $2, $3, $4, $5, $6)`,
            [apptId, userId, clientName, clientEmail || null, dateTime, finalStatus]
        );
        return res.status(201).json({ success: true, id: String(apptId) });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// RÉCUPÉRER LES RENDEZ-VOUS
app.get('/api/appointments', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId requis." });
    try {
        await connectDatabase();
        const result = await client.query('SELECT id, "userId", "clientName", "clientEmail", "dateTime", status FROM appointments WHERE "userId" = $1', [userId]);
        const formattedRows = result.rows.map(row => ({
            id: String(row.id),
            userId: String(row.userId),
            clientName: row.clientName,
            clientEmail: row.clientEmail || '',
            dateTime: row.dateTime,
            status: row.status
        }));
        return res.json(formattedRows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// MODIFIER LE STATUT D'UN RENDEZ-VOUS
app.put('/api/appointments/:id', async (req, res) => {
    const { id } = req.params;
    const { status, lang } = req.body; 
    const updatedStatus = status || 'Confirmed';
    const emailLang = lang === 'en' ? 'en' : 'fr';

    try {
        await connectDatabase();
        const result = await client.query('SELECT id, "userId", "clientName", "clientEmail", "dateTime", status FROM appointments WHERE id = $1', [id]);
        const appointment = result.rows[0];
        if (!appointment) return res.status(404).json({ error: "Rendez-vous introuvable." });

        await client.query("UPDATE appointments SET status = $1 WHERE id = $2", [updatedStatus, id]);

        if (appointment.clientEmail) { 
            const dateNice = formatEmailDate(appointment.dateTime, emailLang);
            let clientHtml, emailSubject;

            if (updatedStatus === 'Confirmed') {
                emailSubject = emailLang === 'en' ? `✅ Appointment Confirmed!` : `✅ Rendez-vous Confirmé !`;
                const details = `<div style="font-size: 14px; color: #cbd5e1;"><strong>Date :</strong> ${dateNice}</div>`;
                clientHtml = generateEmailTemplate(emailLang === 'en' ? "Confirmed" : "Confirmé", "success", emailSubject, "", details);
            } else {
                emailSubject = emailLang === 'en' ? `❌ Appointment Declined` : `❌ Rendez-vous Décliné`;
                const details = `<div style="font-size: 14px; color: #cbd5e1;"><strong>Slot :</strong> ${dateNice}</div>`;
                clientHtml = generateEmailTemplate(emailLang === 'en' ? "Declined" : "Décliné", "error", emailSubject, "", details);
            }
            sendNotificationEmail(appointment.clientEmail, emailSubject, clientHtml);
        }
        return res.json({ id: String(id), status: updatedStatus });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// SUPPRIMER UN RENDEZ-VOUS
app.delete('/api/appointments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await connectDatabase();
        await client.query("DELETE FROM appointments WHERE id = $1", [id]);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// FORMULAIRE PUBLIC POUR LES CLIENTS
app.post('/api/public/book', async (req, res) => {
    const { userId, clientName, clientEmail, dateTime } = req.body;
    if (!userId || !clientName || !clientEmail || !dateTime) return res.status(400).json({ error: "Champs manquants." });
    const apptId = Date.now(); 

    try {
        await connectDatabase();
        await client.query(
            `INSERT INTO appointments (id, "userId", "clientName", "clientEmail", "dateTime", status) VALUES ($1, $2, $3, $4, $5, $6)`,
            [apptId, userId, clientName, clientEmail, dateTime, "Pending"]
        );
        return res.status(201).json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Serveur actif sur le port ${PORT}`));