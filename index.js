const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { Pool } = require('pg'); 
require('dotenv').config(); 

// 🎯 CORRECTIF CRUCIAL : Permet à JSON.stringify de sérialiser les types BigInt retournés par PostgreSQL
BigInt.prototype.toJSON = function() { return this.toString(); };

// Utilise la variable d'environnement ou la chaîne par défaut de manière sécurisée
const connectionString = process.env.DATABASE_URL || "postgresql://postgres.dmmtxstoystqampadggp:Ilovegaming21@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// -------------------------------------------------------------
// INITIALISATION DE LA BASE DE DONNÉES POSTGRESQL (SUPABASE)
// -------------------------------------------------------------
const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false // Requis pour les connexions cloud sécurisées
    }
});

pool.connect((err) => {
    if (err) {
        console.error("❌ Erreur lors de la connexion à PostgreSQL :", err.message);
    } else {
        console.log("🗄️ Connecté avec succès à la base de données PostgreSQL via le Pooler AWS.");
    }
});

// Création des tables alignée avec les types bigint de Supabase
const initDb = async () => {
    try {
        // Table des Commerçants
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id bigint PRIMARY KEY,
                email TEXT UNIQUE,
                password TEXT,
                company TEXT
            )
        `);

        // Table des Rendez-vous
        await pool.query(`
            CREATE TABLE IF NOT EXISTS appointments (
                id bigint PRIMARY KEY,
                userId bigint,
                clientName TEXT,
                clientEmail TEXT,
                dateTime TEXT,
                status TEXT
            )
        `);

        // Insérer un utilisateur de test par défaut si vide
        const res = await pool.query("SELECT COUNT(*) as count FROM users");
        if (parseInt(res.rows[0].count) === 0) {
            await pool.query(
                "INSERT INTO users (id, email, password, company) VALUES ($1, $2, $3, $4)", 
                [1, "merchant-test@saas.com", "123", "SaaS Partner Ltd."]
            );
            console.log("👤 Utilisateur de test inséré par défaut (id: 1).");
        }
    } catch (err) {
        console.error("❌ Erreur lors de l'initialisation des tables :", err.message);
    }
};
initDb();

// -------------------------------------------------------------
// CONFIGURATION DE NODEMAILER (Transporteur d'emails)
// -------------------------------------------------------------
let transporter;

async function initEmailTransporter() {
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        transporter = nodemailer.createTransport({
            service: 'gmail', 
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
        console.log("📧 Transporter email configuré via le fichier .env");
    } else {
        try {
            let testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                network: "smtp.ethereal.email",
                host: "smtp.ethereal.email",
                port: 587,
                secure: false, 
                auth: {
                    user: testAccount.user, 
                    pass: testAccount.pass, 
                },
            });
            console.log("🔮 Compte email de test généré automatiquement (Ethereal).");
        } catch (err) {
            console.log("⚠️ Impossible de générer le compte de test Ethereal.");
        }
    }
}
initEmailTransporter();

function formatEmailDate(dateTimeStr, lang = 'fr') {
    if (!dateTimeStr) return '';
    const dateObj = new Date(dateTimeStr);
    const locale = lang === 'en' ? 'en-US' : 'fr-FR';
    return dateObj.toLocaleDateString(locale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function generateEmailTemplate(badgeText, badgeColor, title, description, detailsHtml) {
    const isSuccess = badgeColor === 'success';
    const gradient = isSuccess 
        ? 'linear-gradient(135deg, #1e1b4b 0%, #2e1065 100%)' 
        : 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)';
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
            <div style="text-align: center; font-size: 12px; color: #475569; margin-top: 24px; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 20px;">
                &copy; 2026 SaaS Appointment Manager. Tous droits réservés.
            </div>
        </div>
    </body>
    </html>
    `;
}

async function sendNotificationEmail(toEmail, subject, htmlContent) {
    try {
        if (!transporter) return;
        let info = await transporter.sendMail({
            from: '"SaaS Appointment Manager" <noreply@saasappointment.com>',
            to: toEmail,
            subject: subject,
            html: htmlContent
        });
        console.log(`✉️ Email envoyé avec succès à ${toEmail} !`);
    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de l'email :", error);
    }
}

// ROUTE 1 : CONNEXION
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query("SELECT * FROM users WHERE LOWER(email) = LOWER($1)", [email]);
        const user = result.rows[0];
        
        if (!user || user.password !== password) {
            return res.status(400).json({ error: "Identifiants invalides." });
        }
        return res.json({ id: String(user.id), email: user.email, company: user.company });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ROUTE 2 : INSCRIPTION
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Champs manquants." });
    }
    const userId = Date.now(); 
    try {
        await pool.query(
            "INSERT INTO users (id, email, password, company) VALUES ($1, $2, $3, $4)", 
            [userId, email, password, ""]
        );
        return res.status(201).json({ id: String(userId), email });
    } catch (err) {
        if (err.message.includes("unique") || err.code === '23505') {
            return res.status(400).json({ error: "Cet e-mail est déjà utilisé." });
        }
        return res.status(500).json({ error: err.message });
    }
});

// RECUPERER LES INFOS PROFIL UTILISATEUR
app.get('/api/user/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query("SELECT id, email, company FROM users WHERE id = $1", [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Utilisateur introuvable." });
        
        const user = result.rows[0];
        return res.json({ id: String(user.id), email: user.email, company: user.company });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// COMPATIBILITÉ FRONTEND : Gère l'appel alternatif vers /api/profile
app.get('/api/profile', async (req, res) => {
    const { userId } = req.query;
    try {
        const result = await pool.query("SELECT id, email, company FROM users WHERE id = $1", [userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Utilisateur introuvable." });
        
        const user = result.rows[0];
        return res.json({ id: String(user.id), email: user.email, company: user.company });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// METTRE À JOUR LE PROFIL
app.post('/api/user/update', async (req, res) => {
    const { userId, company, password } = req.body;
    if (!userId) return res.status(400).json({ error: "ID Utilisateur manquant." });

    try {
        if (password) {
            await pool.query("UPDATE users SET company = $1, password = $2 WHERE id = $3", [company, password, userId]);
            return res.json({ success: true, message: "Profil et mot de passe mis à jour." });
        } else {
            await pool.query("UPDATE users SET company = $1 WHERE id = $2", [company, userId]);
            return res.json({ success: true, message: "Profil mis à jour." });
        }
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ROUTE 3 : RÉCUPÉRER LES RENDEZ-VOUS
app.get('/api/appointments', async (req, res) => {
    const { userId } = req.query;
    try {
        const result = await pool.query("SELECT * FROM appointments WHERE userId = $1", [userId]);
        const formattedRows = result.rows.map(row => ({
            ...row,
            id: String(row.id),
            userid: String(row.userid)
        }));
        return res.json(formattedRows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ROUTE 5 : MODIFIER LE STATUT D'UN RENDEZ-VOUS
app.put('/api/appointments/:id', async (req, res) => {
    const { id } = req.params;
    const { status, lang } = req.body; 
    const updatedStatus = status || 'Confirmed';
    const emailLang = lang === 'en' ? 'en' : 'fr';

    if (!['Confirmed', 'Cancelled'].includes(updatedStatus)) {
        return res.status(400).json({ error: "Statut invalide." });
    }

    try {
        const result = await pool.query("SELECT * FROM appointments WHERE id = $1", [id]);
        const appointment = result.rows[0];
        if (!appointment) return res.status(404).json({ error: "Rendez-vous introuvable." });

        await pool.query("UPDATE appointments SET status = $1 WHERE id = $2", [updatedStatus, id]);

        if (appointment.clientemail) { 
            const clientEmailField = appointment.clientemail;
            const clientNameField = appointment.clientname;
            const dateTimeField = appointment.datetime;

            const dateNice = formatEmailDate(dateTimeField, emailLang);
            let clientHtml;
            let emailSubject;

            if (updatedStatus === 'Confirmed') {
                emailSubject = emailLang === 'en' ? `✅ Appointment Confirmed!` : `✅ Rendez-vous Confirmé !`;
                const desc = emailLang === 'en' ? `Great news! Your booking request has been accepted.` : `Le commerçant a accepté votre rendez-vous.`;
                const details = `
                    <div style="font-size: 14px; color: #cbd5e1; margin-bottom: 8px;"><strong>Date :</strong> ${dateNice}</div>
                    <div style="font-size: 14px; color: #cbd5e1; margin-bottom: 8px;"><strong>Client :</strong> ${clientNameField}</div>
                `;
                clientHtml = generateEmailTemplate(emailLang === 'en' ? "Confirmed" : "Confirmé", "success", emailSubject, desc, details);
            } else {
                emailSubject = emailLang === 'en' ? `❌ Appointment Declined` : `❌ Rendez-vous Décliné`;
                const desc = emailLang === 'en' ? `Unfortunately, the professional is unavailable.` : `Le commerçant n'est pas disponible.`;
                const details = `<div style="font-size: 14px; color: #cbd5e1;"><strong>Slot :</strong> ${dateNice}</div>`;
                clientHtml = generateEmailTemplate(emailLang === 'en' ? "Declined" : "Décliné", "error", emailSubject, desc, details);
            }
            sendNotificationEmail(clientEmailField, emailSubject, clientHtml);
        }
        return res.json({ id: String(id), status: updatedStatus });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ROUTE 6 : SUPPRIMER UN RENDEZ-VOUS
app.delete('/api/appointments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM appointments WHERE id = $1", [id]);
        return res.json({ success: true, message: "Rendez-vous supprimé avec succès." });
    } catch (err) {
        return res.status(500).json({ error: "Erreur lors de la suppression." });
    }
});

// ROUTE 7 : FORMULAIRE PUBLIC POUR LES CLIENTS
app.post('/api/public/book', async (req, res) => {
    const { userId, clientName, clientEmail, dateTime, lang } = req.body;
    const emailLang = lang === 'en' ? 'en' : 'fr';

    if (!userId || !clientName || !clientEmail || !dateTime) {
        return res.status(400).json({ error: "Champs manquants." });
    }

    const apptId = Date.now(); 
    const status = "Pending";

    try {
        await pool.query(
            `INSERT INTO appointments (id, userId, clientName, clientEmail, dateTime, status) VALUES ($1, $2, $3, $4, $5, $6)`,
            [apptId, userId, clientName, clientEmail, dateTime, status]
        );

        const dateNice = formatEmailDate(dateTime, emailLang);

        // 1. Notification au Commerçant
        const merchantRes = await pool.query("SELECT email FROM users WHERE id = $1", [userId]);
        if (merchantRes.rows.length > 0) {
            const merchant = merchantRes.rows[0];
            const detailsMerchant = `
                <div style="font-size: 14px; color: #cbd5e1; margin-bottom: 8px;"><strong>Client :</strong> ${clientName}</div>
                <div style="font-size: 14px; color: #cbd5e1;"><strong>Date souhaitée :</strong> ${dateNice}</div>
            `;
            const merchantHtml = generateEmailTemplate("Nouveau RDV", "success", "🔔 Nouvelle demande reçue !", "Vérifiez votre tableau de bord.", detailsMerchant);
            sendNotificationEmail(merchant.email, `🔔 Nouveau RDV - ${clientName}`, merchantHtml);
        }

        // 2. Notification au Client
        const clientSubject = emailLang === 'en' ? "⏳ Booking request received" : "⏳ Demande de réservation reçue";
        const clientHtml = generateEmailTemplate(emailLang === 'en' ? "Pending" : "En attente", "success", clientSubject, "Votre demande est en cours d'examen.", `<div><strong>Créneau :</strong> ${dateNice}</div>`);
        sendNotificationEmail(clientEmail, clientSubject, clientHtml);

        return res.status(201).json({ success: true, message: "Rendez-vous enregistré avec succès !" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Serveur connecté à PostgreSQL et démarré sur le port ${PORT}`);
});