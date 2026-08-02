// arka-backend/index.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const apiRoutes = require('./routes/api'); // Importamos nuestras rutas

const app = express();
const PORT = process.env.PORT || 3000;

// Orígenes web autorizados a consumir esta API desde el navegador.
// Se conserva el dominio anterior durante la transición para no interrumpir
// instalaciones del frontend que aún no se hayan actualizado.
const allowedOrigins = [
    'https://arkashops.online',
    'https://www.arkashops.online',
    'https://arkasistema.online',
    'https://www.arkasistema.online'
];

const corsOptions = {
    origin(origin, callback) {
        // Clientes no navegadores (curl, monitoreo interno) no envían Origin.
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error(`Origen no autorizado por CORS: ${origin}`));
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Conectado a MongoDB'))
    .catch(err => console.error('❌ No se pudo conectar a MongoDB', err));

// Le decimos a Express que todas las rutas que empiecen con /api
// deben ser manejadas por nuestro archivo de rutas.
app.use('/api', apiRoutes);

app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
});
