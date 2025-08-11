const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const creditSchema = new Schema({
  client: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
  products: [
    {
      name: { type: String, required: true },
      price: { type: Number, required: true }
    }
  ],
  totalAmount: { type: Number, required: true },
  originalAmount: { type: Number, required: true },
  installments: { type: Number, required: true },
  remainingInstallments: { type: Number, required: true },
  status: { type: String, enum: ['activo', 'pagado'], default: 'activo' },
  paymentFrequency: { type: String, enum: ['semanal', 'quincenal'], required: true },
  paymentDayOfWeek: { type: Number }, // Para pagos semanales
  paymentDaysOfMonth: { type: [Number] }, // Para pagos quincenales
  nextPaymentDate: { type: Date },
  completionDate: { type: Date },
  paymentHistory: [
    {
      amount: { type: Number },
      date: { type: Date }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('Credit', creditSchema);