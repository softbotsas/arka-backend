const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const clientSchema = new Schema({
  fullName: { type: String, required: true },
  cedula: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  address: { type: String, required: true }
}, { timestamps: true }); // timestamps añade createdAt y updatedAt automáticamente

module.exports = mongoose.model('Client', clientSchema);