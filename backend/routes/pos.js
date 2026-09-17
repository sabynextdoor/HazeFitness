const express = require('express');
const router = express.Router();
const db = require('../database/db');
const dayjs = require('dayjs');

// ---- Products ----
router.get('/products', async (req, res) => {
  res.json(await db.all('SELECT * FROM pos_products ORDER BY name'));
});

router.post('/products', async (req, res) => {
  const { name, category, price, stock } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'name and price are required' });
  const result = await db.run(
    'INSERT INTO pos_products (name, category, price, stock) VALUES (?, ?, ?, ?)',
    [name, category || null, price, stock || 0]
  );
  res.status(201).json(await db.get('SELECT * FROM pos_products WHERE id = ?', [result.lastInsertRowid]));
});

router.put('/products/:id', async (req, res) => {
  const existing = await db.get('SELECT * FROM pos_products WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const f = { ...existing, ...req.body };
  await db.run('UPDATE pos_products SET name=?, category=?, price=?, stock=? WHERE id=?',
    [f.name, f.category, f.price, f.stock, req.params.id]);
  res.json(await db.get('SELECT * FROM pos_products WHERE id = ?', [req.params.id]));
});

// Deleting a product with past sales would corrupt the sales history, so keep
// those products and ask staff to set stock to zero instead.
router.delete('/products/:id', async (req, res) => {
  const existing = await db.get('SELECT id FROM pos_products WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const used = await db.get('SELECT COUNT(*) AS c FROM pos_sale_items WHERE product_id = ?', [req.params.id]);
  if (used.c > 0) return res.status(409).json({ error: 'This product appears in past sales and cannot be deleted. Set its stock to 0 instead.' });
  await db.run('DELETE FROM pos_products WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ---- Sales ----
// POST /api/pos/sales { member_id?, payment_mode, items: [{product_id, qty}] }
router.post('/sales', async (req, res) => {
  const { member_id, payment_mode, items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required' });
  }

  try {
    const saleId = await db.transaction(async (tx) => {
      let total = 0;
      const resolvedItems = [];
      for (const it of items) {
        const product = await tx.get('SELECT * FROM pos_products WHERE id = ?', [it.product_id]);
        if (!product) throw new Error(`Product ${it.product_id} not found`);
        if (product.stock < it.qty) throw new Error(`Insufficient stock for ${product.name}`);
        total += product.price * it.qty;
        resolvedItems.push({ product, qty: it.qty });
      }

      const saleResult = await tx.run(
        'INSERT INTO pos_sales (sale_date, member_id, total_amount, payment_mode) VALUES (?, ?, ?, ?)',
        [dayjs().format('YYYY-MM-DD'), member_id || null, total, payment_mode || 'cash']
      );

      for (const { product, qty } of resolvedItems) {
        await tx.run(
          'INSERT INTO pos_sale_items (sale_id, product_id, qty, unit_price) VALUES (?, ?, ?, ?)',
          [saleResult.lastInsertRowid, product.id, qty, product.price]
        );
        await tx.run('UPDATE pos_products SET stock = stock - ? WHERE id = ?', [qty, product.id]);
      }
      return saleResult.lastInsertRowid;
    });

    const sale = await db.get('SELECT * FROM pos_sales WHERE id = ?', [saleId]);
    sale.items = await db.all(`
      SELECT si.*, pr.name AS product_name FROM pos_sale_items si
      JOIN pos_products pr ON pr.id = si.product_id WHERE si.sale_id = ?
    `, [saleId]);
    res.status(201).json(sale);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/sales', async (req, res) => {
  const { date_from, date_to } = req.query;
  let sql = `SELECT s.*, m.full_name AS member_name FROM pos_sales s
             LEFT JOIN members m ON m.id = s.member_id WHERE 1=1`;
  const params = [];
  if (date_from) { sql += ' AND s.sale_date >= ?'; params.push(date_from); }
  if (date_to) { sql += ' AND s.sale_date <= ?'; params.push(date_to); }
  sql += ' ORDER BY s.created_at DESC';
  res.json(await db.all(sql, params));
});

module.exports = router;
