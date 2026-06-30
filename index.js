const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config(); 

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// -------------------------------------------------------------
// INITIALISATION DE LA BASE DE DONNÉES SQLITE
// -------------------------------------------------------------
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("❌ Erreur lors de l'ouverture de la base de données :", err.message);
    } else {
        console.log("🗄️ Connecté avec succès à la base de données SQLite locale.");
    }
});

// Création des tables si elles n'existent pas
db.serialize(() => {
    // Table des Commerçants (Users)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password TEXT
    )`);

    // Table des Rendez-vous (Appointments)
    db.run(`CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        userId TEXT,
        clientName TEXT,
        clientEmail TEXT,
        dateTime TEXT,
        status TEXT
    )`);

    // Insérer un utilisateur de test par défaut si la table est vide
    db.get("SELECT COUNT(*) as count FROM users", [], (err, row) => {
        if (!err && row.count === 0) {
            db.run("INSERT INTO users (id, email, password) VALUES (?, ?, ?)", ["1", "merchant-test@saas.com", "123"]);
            console.log("👤 Utilisateur de test inséré par défaut (id: 1).");
        }
    });
});

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

// FONCTION DE FORMATAGE DE LA DATE (S'adapte à la langue demandée)
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

// NOUVEAU GÉNÉRATEUR DE DESIGN HTML PREMIUM (Glassmorphism & SaaS Dark UI)
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
    <head>
        <meta charset="UTF-8">
    </head>
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
        if (nodemailer.getTestMessageUrl(info)) {
            console.log(`🔗 Voir l'email : ${nodemailer.getTestMessageUrl(info)}`);
        }
    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de l'email :", error);
    }
}

// ROUTE 1 : CONNEXION (Login via SQLite)
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", [email], (err, user) => {
        if (err || !user || user.password !== password) {
            return res.status(400).json({ error: "Identifiants invalides." });
        }
        return res.json({ id: user.id, email: user.email });
    });
});

// ROUTE 2 : INSCRIPTION (Ajoutée pour régler le problème du bouton Register / Sign Up)
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: "Champs manquants." });
    }

    const userId = String(Date.now());

    db.run("INSERT INTO users (id, email, password) VALUES (?, ?, ?)", [userId, email, password], function(err) {
        if (err) {
            if (err.message.includes("UNIQUE")) {
                return res.status(400).json({ error: "Cet e-mail est déjà utilisé." });
            }
            return res.status(500).json({ error: err.message });
        }
        return res.status(201).json({ id: userId, email });
    });
});

// ROUTE 3 : RÉCUPÉRER LES RENDEZ-VOUS DEPUIS SQLITE
app.get('/api/appointments', (req, res) => {
    const { userId } = req.query;
    db.all("SELECT * FROM appointments WHERE userId = ?", [String(userId)], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        return res.json(rows);
    });
});

// ROUTE 5 : MODIFIER LE STATUT D'UN RENDEZ-VOUS (Accepter ou Refuser)
app.put('/api/appointments/:id', (req, res) => {
    const { id } = req.params;
    const { status, lang } = req.body; 
    const updatedStatus = status || 'Confirmed';
    const emailLang = lang === 'en' ? 'en' : 'fr';

    if (!['Confirmed', 'Cancelled'].includes(updatedStatus)) {
        return res.status(400).json({ error: "Statut invalide." });
    }

    db.get("SELECT * FROM appointments WHERE id = ?", [id], (err, appointment) => {
        if (err || !appointment) return res.status(404).json({ error: "Rendez-vous introuvable." });

        db.run("UPDATE appointments SET status = ? WHERE id = ?", [updatedStatus, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });

            if (appointment.clientEmail) {
                const dateNice = formatEmailDate(appointment.dateTime, emailLang);
                let clientHtml;
                let emailSubject;

                if (updatedStatus === 'Confirmed') {
                    emailSubject = emailLang === 'en' ? `✅ Appointment Confirmed!` : `✅ Rendez-vous Confirmé !`;
                    
                    const desc = emailLang === 'en' 
                        ? `Great news! Your booking request has been accepted and verified by the merchant.` 
                        : `Bonne nouvelle ! Le commerçant a accepté et validé votre demande de rendez-vous.`;

                    const details = `
                        <div style="font-size: 14px; color: #cbd5e1; margin-bottom: 8px;"><strong>Date & Heure :</strong> ${dateNice}</div>
                        <div style="font-size: 14px; color: #cbd5e1; margin-bottom: 8px;"><strong>Client :</strong> ${appointment.clientName}</div>
                        <div style="font-size: 14px; color: #cbd5e1;"><strong>Statut :</strong> <span style="color:#34d399; font-weight:bold;">${emailLang === 'en' ? 'Confirmed' : 'Validé'}</span></div>
                    `;

                    clientHtml = generateEmailTemplate(
                        emailLang === 'en' ? "Confirmed" : "Confirmé", 
                        "success", 
                        emailLang === 'en' ? "Your booking is validated!" : "Votre rendez-vous est validé !", 
                        desc, 
                        details
                    );
                } else if (updatedStatus === 'Cancelled') {
                    emailSubject = emailLang === 'en' ? `❌ Your appointment request was declined` : `❌ Votre demande de rendez-vous a été déclinée`;
                    
                    const desc = emailLang === 'en'
                        ? `Unfortunately, the professional is unavailable during the requested time slot. Please check their public booking page to try another schedule.`
                        : `Malheureusement, le commerçant ne pourra pas vous recevoir sur le créneau que vous aviez demandé. Nous vous invitons à soumettre une nouvelle demande.`;

                    const details = `
                        <div style="font-size: 14px; color: #cbd5e1; margin-bottom: 8px; color:#f87171;"><strong>Slot declined :</strong> ${dateNice}</div>
                        <div style="font-size: 14px; color: #cbd5e1;"><strong>Client :</strong> ${appointment.clientName}</div>
                    `;

                    clientHtml = generateEmailTemplate(
                        emailLang === 'en' ? "Declined" : "Décliné", 
                        "error", 
                        emailLang === 'en' ? "Request Declined" : "Demande déclinée", 
                        desc, 
                        details
                    );
                }

                sendNotificationEmail(appointment.clientEmail, emailSubject, clientHtml);
            }
            return res.json({ id, status: updatedStatus });
        });
    });
});

// ROUTE 6 : SUPPRIMER UN RENDEZ-VOUS (Bouton Poubelle)
app.delete('/api/appointments/:id', (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM appointments WHERE id = ?", [id], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ error: "Erreur lors de la suppression." });
        }
        return res.json({ success: true, message: "Rendez-vous supprimé avec succès." });
    });
});

// ROUTE 7 : FORMULAIRE PUBLIC POUR LES CLIENTS
app.post('/api/public/book', (req, res) => {
    const { userId, clientName, clientEmail, dateTime, lang } = req.body;
    const emailLang = lang === 'en' ? 'en' : 'fr';

    if (!userId || !clientName || !clientEmail || !dateTime) {
        return res.status(400).json({ error: "Champs manquants." });
    }

    const apptId = String(Date.now());
    const status = "Pending";

    db.run(
        `INSERT INTO appointments (id, userId, clientName, clientEmail, dateTime, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [apptId, String(userId), clientName, clientEmail, dateTime, status],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });

            const dateNice = formatEmailDate(dateTime, emailLang);

            // 1. Notification au Commerçant
            db.get("SELECT email FROM users WHERE id = ?", [String(userId)], (err, merchant) => {
                if (!err && merchant) {
                    const detailsMerchant = `
                        <div style="font-size: 14px; color: #cbd5e1; margin-bottom: 8px;"><strong>Client :</strong> ${clientName}</div>
                        <div style="font-size: 14px; color: #cbd5e1; margin-bottom: 8px;"><strong>E-mail :</strong> ${clientEmail}</div>
                        <div style="font-size: 14px; color: #cbd5e1;"><strong>Date souhaitée :</strong> ${formatEmailDate(dateTime, 'fr')}</div>
                    `;
                    const merchantHtml = generateEmailTemplate(
                        "Nouveau RDV", 
                        "success", 
                        "🔔 Nouvelle demande reçue !", 
                        "Un client vient de solliciter un créneau via votre page publique de réservation. Rendez-vous sur votre tableau de bord pour y répondre.", 
                        detailsMerchant
                    );
                    sendNotificationEmail(merchant.email, `🔔 Nouveau RDV en attente - ${clientName}`, merchantHtml);
                }
            });

            // 2. Notification au Client
            const clientSubject = emailLang === 'en' ? "⏳ Booking request received" : "⏳ Demande de réservation reçue";
            const clientTitle = emailLang === 'en' ? "Your request has been sent!" : "Votre demande a bien été envoyée !";
            const clientDesc = emailLang === 'en'
                ? `Hi ${clientName}, your booking request has been securely transmitted. It is currently under review by the professional.`
                : `Bonjour ${clientName}, votre demande a bien été transmise. Elle est en cours d'examen par le professionnel.`;

            const detailsClient = `
                <div style="font-size: 14px; color: #cbd5e1;"><strong>${emailLang === 'en' ? 'Requested slot:' : 'Créneau demandé :'}</strong> ${dateNice}</div>
            `;

            const clientHtml = generateEmailTemplate(
                emailLang === 'en' ? "Pending" : "En attente", 
                "success", 
                clientTitle, 
                clientDesc, 
                detailsClient
            );
            
            sendNotificationEmail(clientEmail, clientSubject, clientHtml);

            return res.status(201).json({ success: true, message: "Rendez-vous enregistré avec succès !" });
        }
    );
});

app.listen(PORT, () => {
    console.log(`🚀 Serveur connecté à SQLite et démarré sur http://localhost:${PORT}`);
});