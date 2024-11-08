const { Telegraf } = require('telegraf');
require('dotenv').config();
const mysql = require('mysql2');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Configuración del bot de Telegram
const bot = new Telegraf(process.env.BOT_TOKEN);

// Configuración de la base de datos
const conexionDB = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'telegram_db',
});

conexionDB.connect((error) => {
    if (error) {
        console.error('No se pudo conectar a la base de datos:', error);
        return;
    }
    console.log('Conexión a la base de datos exitosa');
});

// Configuración de Gemini
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const modeloGemini = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Control de sesiones de IA por usuario
const sesionesIA = {};

// Función para revisar si un usuario ya está registrado
const existeUsuario = (chatId, callback) => {
    conexionDB.query('SELECT * FROM usuario WHERE id_chat = ?', [chatId], (error, resultados) => {
        if (error) {
            console.error('Error al consultar la base de datos:', error);
            return callback(error, null);
        }
        callback(null, resultados.length > 0);
    });
};

// Comando de inicio
bot.start((ctx) => {
    const datosUsuario = ctx.from;
    const chatId = ctx.chat.id;

    existeUsuario(chatId, (error, registrado) => {
        if (error) {
            return ctx.reply('Error al verificar tus datos. Por favor, intenta más tarde.');
        }

        if (registrado) {
            ctx.reply(`¡Hola otra vez, ${datosUsuario.first_name}! Me alegra verte de nuevo.`);
        } else {
            conexionDB.query(
                'INSERT INTO usuario (nombre, nombre_usuario, id_chat) VALUES (?, ?, ?)',
                [datosUsuario.first_name, datosUsuario.username, chatId],
                (error) => {
                    if (error) {
                        console.error('Error al registrar el usuario:', error);
                        return;
                    }
                    ctx.reply('¡Bienvenido! Gracias por unirte.');
                }
            );
        }
    });
});

// Comando para activar el modo IA
bot.command('activarIA', (ctx) => {
    const userId = ctx.from.id;
    sesionesIA[userId] = { enModoIA: true };
    ctx.reply('Modo IA activado. Puedes empezar a hacerme preguntas complejas.');
});

// Comando para desactivar el modo IA
bot.command('salirIA', (ctx) => {
    const userId = ctx.from.id;
    sesionesIA[userId] = { enModoIA: false };
    ctx.reply('Modo IA desactivado. Volviendo a respuestas predeterminadas.');
});

// Comando de ayuda
bot.command(['help', 'soporte'], (ctx) => {
    ctx.reply(`Comandos que puedes usar:
/start - Inicia una nueva sesión
/help - Muestra esta ayuda
/activarIA - Activa el modo IA
/salirIA - Desactiva el modo IA`);
});

// Respuestas automáticas personalizadas
bot.hears(['buen día', 'saludos', 'hola'], (ctx) => { 
    ctx.reply(`¡Hola, ${ctx.from.first_name}! ¿Cómo puedo ayudarte hoy?`);
});
bot.hears(['gracias', 'muchas gracias'], (ctx) => {
    ctx.reply('¡Para servirte!');
});
bot.hears(['adiós', 'hasta luego'], (ctx) => {
    ctx.reply('¡Cuídate! Nos vemos pronto.');
});

// Manejador principal de texto, para IA y respuestas predeterminadas
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const mensajeUsuario = ctx.message.text;

    if (sesionesIA[userId] && sesionesIA[userId].enModoIA) {
        // Modo IA activado
        try {
            const respuestaIA = await modeloGemini.generateContent(mensajeUsuario);
            ctx.reply(respuestaIA.response.text()); // Enviar respuesta generada por Gemini
        } catch (error) {
            console.error('Error al obtener respuesta de Gemini:', error);
            ctx.reply('Hubo un problema al procesar tu solicitud en modo IA. Intenta de nuevo más tarde.');
        }
    } else {
        // Respuestas predeterminadas
        if (/saludo/i.test(mensajeUsuario)) {
            ctx.reply('¡Hola! ¿En qué puedo ayudarte?');
        } else if (/ayuda/i.test(mensajeUsuario)) {
            ctx.reply('¿Necesitas ayuda? Puedes usar el comando /help para ver los comandos disponibles.');
        } else {
            ctx.reply('No entendí tu mensaje. ¿Puedes intentar de nuevo?');
        }
    }
});

// Lanzar el bot
bot.launch()
    .then(() => {
        console.log('Bot activo y listo para interactuar');
    })
    .catch((error) => {
        console.error('Error al iniciar el bot:', error);
    });

// Cierre de la conexión al salir
process.on('SIGINT', () => {
    conexionDB.end((error) => {
        if (error) console.error('Error al cerrar la conexión de la base de datos:', error);
        process.exit();
    });
});
