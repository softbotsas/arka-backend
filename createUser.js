require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const username = 'norbelly';      // <-- CAMBIA ESTO
const password = '12345678';  // <-- CAMBIA ESTO

async function createAdminUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Conectado a MongoDB para crear usuario...');

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      console.log('El usuario ya existe.');
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    console.log('¡Usuario administrador creado con éxito!');
  } catch (error) {
    console.error('Error al crear el usuario:', error);
  } finally {
    mongoose.connection.close();
  }
}

createAdminUser();