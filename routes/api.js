const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Importar los modelos
const Client = require('../models/Client');
const Credit = require('../models/Credit');
const User = require('../models/User');

// --- LÓGICA DE CÁLCULO DE FECHAS ---
// Esta función ahora vive en el backend, donde debe estar.
function calculateNextPaymentDate(creditData) {
  const today = new Date();
  // Corrección: Asegurarse de que 'today' esté al inicio del día en la zona horaria del servidor
  today.setHours(0, 0, 0, 0); 

  let nextDate = new Date(today.getTime());

  if (creditData.paymentFrequency === 'semanal') {
    const paymentDay = parseInt(creditData.paymentDayOfWeek, 10);
    // En JS, Domingo=0, Lunes=1... Sábado=6. En nuestro sistema, Lunes=1... Domingo=7
    const currentDayJS = today.getDay(); // 0-6
    const paymentDayJS = paymentDay % 7; // Convertimos nuestro Domingo=7 a Domingo=0

    let daysUntilNext = paymentDayJS - currentDayJS;
    if (daysUntilNext <= 0) {
      daysUntilNext += 7; // Si el día ya pasó o es hoy, sumar 7 días
    }
    
    nextDate.setDate(today.getDate() + daysUntilNext);
    
  } else if (creditData.paymentFrequency === 'quincenal') {
    const sortedDays = creditData.paymentDaysOfMonth.sort((a, b) => a - b);
    let targetDay = sortedDays.find(day => day > today.getDate());
    if (targetDay) {
      nextDate.setDate(targetDay);
    } else {
      nextDate.setMonth(today.getMonth() + 1);
      nextDate.setDate(sortedDays[0]);
    }
  }
  return nextDate;
}

// --- RUTA DE AUTENTICACIÓN ---

// POST /api/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: "Usuario y contraseña son requeridos." });
    }
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET || 'una-clave-secreta-muy-segura-para-desarrollo',
      { expiresIn: '30d' }
    );
    res.status(200).json({ token });
  } catch (error) {
    res.status(500).json({ message: "Error en el servidor durante el inicio de sesión", error });
  }
});


// --- RUTAS DE CLIENTES ---

router.get('/clients', async (req, res) => {
  try {
    const clients = await Client.find({});
    res.status(200).json(clients);
  } catch (error) { res.status(500).json({ message: "Error al obtener clientes", error }); }
});

router.post('/clients', async (req, res) => {
    try {
        const newClient = new Client(req.body);
        await newClient.save();
        res.status(201).json(newClient);
    } catch (error) { res.status(400).json({ message: "Error al crear cliente", error }); }
});

router.get('/clients/:id', async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return res.status(404).json({ message: "Cliente no encontrado" });
        res.status(200).json(client);
    } catch (error) { res.status(500).json({ message: "Error al buscar cliente", error }); }
});

router.put('/clients/:id', async (req, res) => {
    try {
        const updatedClient = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedClient) return res.status(404).json({ message: "Cliente no encontrado" });
        res.status(200).json(updatedClient);
    } catch (error) { res.status(400).json({ message: "Error al actualizar cliente", error }); }
});

router.get('/clients/:id/credits', async (req, res) => {
    try {
        const credits = await Credit.find({ client: req.params.id });
        res.status(200).json(credits);
    } catch (error) { res.status(500).json({ message: "Error al obtener créditos del cliente", error }); }
});


// --- RUTAS DE CRÉDITOS ---

router.get('/credits', async (req, res) => {
    try {
        // Solo obtener créditos activos (no completados)
        const credits = await Credit.find({ status: 'activo' }).populate('client', 'fullName cedula');
        res.status(200).json(credits);
    } catch (error) { res.status(500).json({ message: "Error al obtener créditos", error }); }
});

// Ruta para obtener créditos completados
router.get('/credits/completed', async (req, res) => {
    try {
        const completedCredits = await Credit.find({ status: 'pagado' })
            .populate('client', 'fullName cedula')
            .sort({ completionDate: -1 }); // Más recientes primero
        res.status(200).json(completedCredits);
    } catch (error) { 
        res.status(500).json({ message: "Error al obtener créditos completados", error }); 
    }
});
    
router.post('/credits', async (req, res) => {
    try {
        const creditData = req.body;
        const totalAmount = creditData.products.reduce((sum, p) => sum + p.price, 0);
        const nextPaymentDate = calculateNextPaymentDate(creditData); // <-- Lógica clave

        const newCredit = new Credit({
            ...creditData,
            totalAmount: totalAmount,
            originalAmount: totalAmount,
            remainingInstallments: creditData.installments,
            paymentHistory: [],
            completionDate: null,
            nextPaymentDate: nextPaymentDate,
        });
        await newCredit.save();
        const populatedCredit = await Credit.findById(newCredit._id).populate('client');
        res.status(201).json(populatedCredit);
    } catch (error) {
        res.status(400).json({ message: "Error al crear el crédito", error: error.message });
    }
});

router.get('/credits/:id', async (req, res) => {
    try {
        const credit = await Credit.findById(req.params.id).populate('client');
        if (!credit) return res.status(404).json({ message: "Crédito no encontrado" });
        res.status(200).json(credit);
    } catch (error) { res.status(500).json({ message: "Error al buscar el crédito", error }); }
});

router.put('/credits/:id', async (req, res) => {
    try {
        const updatedData = req.body;
        const originalCredit = await Credit.findById(req.params.id);
        if (!originalCredit) return res.status(404).json({ message: "Crédito no encontrado" });
        
        // Si se están agregando cuotas adicionales
        if (updatedData.installments && updatedData.remainingInstallments) {
            const paidInstallments = originalCredit.installments - originalCredit.remainingInstallments;
            updatedData.remainingInstallments = updatedData.installments - paidInstallments;
            if (updatedData.remainingInstallments < 0) updatedData.remainingInstallments = 0;
        } else {
            // Lógica normal de actualización
            const paidInstallments = originalCredit.installments - originalCredit.remainingInstallments;
            updatedData.remainingInstallments = updatedData.installments - paidInstallments;
            if (updatedData.remainingInstallments < 0) updatedData.remainingInstallments = 0;
        }
        
        const updatedCredit = await Credit.findByIdAndUpdate(req.params.id, updatedData, { new: true });
        res.status(200).json(updatedCredit);
    } catch (error) { res.status(400).json({ message: "Error al actualizar el crédito", error }); }
});

router.delete('/credits/:id', async (req, res) => {
    try {
        const deletedCredit = await Credit.findByIdAndDelete(req.params.id);
        if (!deletedCredit) return res.status(404).json({ message: "Crédito no encontrado" });
        res.status(200).json({ message: "Crédito eliminado con éxito" });
    } catch (error) { res.status(500).json({ message: "Error al eliminar el crédito", error }); }
});

router.post('/credits/:id/payments', async (req, res) => {
    try {
        const credit = await Credit.findById(req.params.id);
        if (!credit) return res.status(404).json({ message: "Crédito no encontrado" });
        const { amount } = req.body;
        credit.paymentHistory.push({ amount, date: new Date() });
        credit.totalAmount -= amount;
        credit.remainingInstallments -= 1;
        
        // Solo marcar como pagado si realmente se pagó todo el monto
        if (credit.totalAmount <= 0) {
            credit.status = 'pagado';
            credit.totalAmount = 0;
            credit.nextPaymentDate = null;
            credit.completionDate = new Date();
        } else if (credit.remainingInstallments <= 0) {
            // Si se agotaron las cuotas pero aún hay saldo pendiente
            // GUARDAR el abono primero, luego devolver información del saldo restante
            await credit.save();
            return res.status(200).json({
                credit,
                needsMoreInstallments: true,
                remainingBalance: credit.totalAmount
            });
        }
        await credit.save();
        res.status(200).json(credit);
    } catch (error) { res.status(400).json({ message: "Error al registrar el pago", error }); }
});

// --- RUTAS PARA EDITAR Y ELIMINAR ABONOS ---
router.put('/credits/:id/payments/:paymentIndex', async (req, res) => {
    try {
        const credit = await Credit.findById(req.params.id);
        if (!credit) return res.status(404).json({ message: "Crédito no encontrado" });
        
        const paymentIndex = parseInt(req.params.paymentIndex);
        if (paymentIndex < 0 || paymentIndex >= credit.paymentHistory.length) {
            return res.status(400).json({ message: "Índice de pago inválido" });
        }
        
        const { amount } = req.body;
        const oldAmount = credit.paymentHistory[paymentIndex].amount;
        
        // Actualizar el monto del pago
        credit.paymentHistory[paymentIndex].amount = amount;
        
        // Recalcular el totalAmount
        credit.totalAmount = credit.totalAmount + oldAmount - amount;
        
        // Verificar si el crédito debe marcarse como pagado
        if (credit.totalAmount <= 0) {
            credit.status = 'pagado';
            credit.totalAmount = 0;
            credit.nextPaymentDate = null;
            credit.completionDate = new Date();
        }
        
        await credit.save();
        res.status(200).json(credit);
    } catch (error) {
        res.status(400).json({ message: "Error al editar el abono", error: error.message });
    }
});

router.delete('/credits/:id/payments/:paymentIndex', async (req, res) => {
    try {
        const credit = await Credit.findById(req.params.id);
        if (!credit) return res.status(404).json({ message: "Crédito no encontrado" });
        
        const paymentIndex = parseInt(req.params.paymentIndex);
        if (paymentIndex < 0 || paymentIndex >= credit.paymentHistory.length) {
            return res.status(400).json({ message: "Índice de pago inválido" });
        }
        
        const deletedPayment = credit.paymentHistory[paymentIndex];
        
        // Eliminar el pago del historial
        credit.paymentHistory.splice(paymentIndex, 1);
        
        // Recalcular el totalAmount (sumar el monto eliminado)
        credit.totalAmount += deletedPayment.amount;
        
        // Recalcular las cuotas restantes (sumar 1 cuota)
        credit.remainingInstallments += 1;
        
        // Si el crédito estaba marcado como pagado, volver a activo
        if (credit.status === 'pagado') {
            credit.status = 'activo';
            credit.completionDate = null;
            // Recalcular la próxima fecha de pago
            credit.nextPaymentDate = calculateNextPaymentDate(credit);
        }
        
        await credit.save();
        res.status(200).json(credit);
    } catch (error) {
        res.status(400).json({ message: "Error al eliminar el abono", error: error.message });
    }
});

// --- NUEVA RUTA PARA AGREGAR CUOTAS ADICIONALES ---
router.post('/credits/:id/add-installments', async (req, res) => {
    try {
        const { additionalInstallments } = req.body;
        const credit = await Credit.findById(req.params.id);
        
        if (!credit) {
            return res.status(404).json({ message: "Crédito no encontrado" });
        }
        
        if (credit.status === 'pagado') {
            return res.status(400).json({ message: "No se pueden agregar cuotas a un crédito ya pagado" });
        }
        
        // SUMAR las cuotas adicionales a las existentes
        const newTotalInstallments = credit.installments + additionalInstallments;
        const newRemainingInstallments = credit.remainingInstallments + additionalInstallments;
        
        credit.installments = newTotalInstallments;
        credit.remainingInstallments = newRemainingInstallments;
        
        await credit.save();
        res.status(200).json(credit);
        
    } catch (error) {
        res.status(400).json({ message: "Error al agregar cuotas adicionales", error: error.message });
    }
});

// --- NUEVA RUTA PARA AÑADIR PRODUCTOS ---
router.post('/credits/:id/add-products', async (req, res) => {
    try {
        const { newProducts, newTotalInstallments } = req.body;
        const credit = await Credit.findById(req.params.id);

        if (!credit || credit.status === 'pagado') {
            return res.status(404).json({ message: "Crédito no encontrado o ya está pagado." });
        }
        if (!newProducts || newProducts.length === 0 || !newTotalInstallments) {
            return res.status(400).json({ message: "Datos incompletos." });
        }

        const newProductsValue = newProducts.reduce((sum, p) => sum + p.price, 0);
        const newTotalAmount = credit.totalAmount + newProductsValue;
        const paidInstallments = credit.installments - credit.remainingInstallments;

        credit.products.push(...newProducts);
        credit.totalAmount = newTotalAmount;
        credit.originalAmount += newProductsValue;
        credit.installments = newTotalInstallments;
        credit.remainingInstallments = newTotalInstallments - paidInstallments;

        if (credit.remainingInstallments < 0) {
            credit.remainingInstallments = 0;
        }

        await credit.save();
        res.status(200).json(credit);

    } catch (error) {
        res.status(400).json({ message: "Error al añadir productos al crédito", error: error.message });
    }
});

// --- RUTAS DE AGENDA Y REPORTES ---

router.get('/agenda', async (req, res) => {
    try {
        const activeCredits = await Credit.find({ status: 'activo' }).populate('client', 'fullName cedula');
        
        // Obtener la fecha actual en Colombia (UTC-5)
        const colombiaTime = new Date().toLocaleString("en-US", {timeZone: "America/Bogota"});
        const today = new Date(colombiaTime);
        today.setHours(0, 0, 0, 0);
        
        // Fecha límite para próximos cobros (7 días)
        const upcomingLimit = new Date(today);
        upcomingLimit.setDate(today.getDate() + 7);
        
        const todayPayments = [];
        const upcomingPayments = [];
        
        activeCredits.forEach(credit => {
            if (!credit.nextPaymentDate) return;
            const nextPayment = new Date(credit.nextPaymentDate);
            nextPayment.setHours(0, 0, 0, 0);
            
            // Cobros de hoy
            if (nextPayment.getTime() === today.getTime()) {
                todayPayments.push(credit);
            }
            // Próximos cobros (hasta 7 días, sin incluir atrasados)
            else if (nextPayment > today && nextPayment <= upcomingLimit) {
                upcomingPayments.push(credit);
            }
        });
        
        res.status(200).json({ 
            today: todayPayments, 
            upcoming: upcomingPayments 
        });
    } catch (error) { res.status(500).json({ message: "Error al generar la agenda", error }); }
});

router.get('/reports/summary', async (req, res) => {
    try {
        const totalDueResult = await Credit.aggregate([ { $match: { status: 'activo' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } } ]);
        const totalDue = totalDueResult.length > 0 ? totalDueResult[0].total : 0;
        const allPayments = await Credit.aggregate([ { $unwind: '$paymentHistory' } ]);
        const totalCollected = allPayments.reduce((sum, p) => sum + p.paymentHistory.amount, 0);
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const currentMonthCollected = allPayments
            .filter(p => new Date(p.paymentHistory.date) >= startOfMonth)
            .reduce((sum, p) => sum + p.paymentHistory.amount, 0);
        res.status(200).json({ totalDue, totalCollected, currentMonthCollected });
    } catch (error) { res.status(500).json({ message: "Error al generar el resumen", error }); }
});

router.get('/reports/completed-sales', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ message: "Se requieren fechas de inicio y fin." });
        const sales = await Credit.find({ status: 'pagado', completionDate: { $gte: new Date(startDate), $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) } }).populate('client', 'fullName cedula');
        res.status(200).json(sales);
    } catch (error) { res.status(500).json({ message: "Error al obtener ventas completadas", error }); }
});

module.exports = router;