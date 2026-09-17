import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { money } from '../utils.js';
import { toast } from '../toast.js';
import Modal from '../components/Modal.jsx';

export default function Pos() {
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [qty, setQty] = useState(1);
  const [memberIdentifier, setMemberIdentifier] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [addOpen, setAddOpen] = useState(false);

  async function loadProducts() {
    const rows = await api('/pos/products');
    setProducts(rows);
    if (rows.length && !selectedProductId) setSelectedProductId(String(rows[0].id));
  }

  async function loadSales() {
    const rows = await api('/pos/sales');
    setSales(rows);
  }

  useEffect(() => { loadProducts(); loadSales(); }, []);

  function addToCart() {
    const productId = Number(selectedProductId);
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === productId);
      if (existing) {
        return prev.map((c) => c.product_id === productId ? { ...c, qty: c.qty + qty } : c);
      }
      return [...prev, { product_id: productId, name: product.name, price: product.price, qty }];
    });
  }

  function removeCartItem(i) {
    setCart((prev) => prev.filter((_, idx) => idx !== i));
  }

  const cartTotal = cart.reduce((sum, c) => sum + c.price * c.qty, 0);

  async function submitSale() {
    if (!cart.length) { toast('Cart is empty', 'error'); return; }
    let member_id = null;
    try {
      if (memberIdentifier.trim()) {
        const matches = await api('/members?search=' + encodeURIComponent(memberIdentifier.trim()));
        member_id = matches.find((m) => m.member_code === memberIdentifier.trim())?.id || (matches.length === 1 ? matches[0].id : null);
        if (!member_id) throw new Error('Member not found for that ID/code');
      }
      await api('/pos/sales', {
        method: 'POST',
        body: JSON.stringify({
          member_id,
          payment_mode: paymentMode,
          items: cart.map((c) => ({ product_id: c.product_id, qty: c.qty })),
        }),
      });
      toast('Sale completed');
      setCart([]);
      setMemberIdentifier('');
      loadProducts();
      loadSales();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleAddProduct(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api('/pos/products', { method: 'POST', body: JSON.stringify(payload) });
      toast('Product added');
      setAddOpen(false);
      e.target.reset();
      loadProducts();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function deleteProduct(product) {
    if (!confirm(`Delete ${product.name}?`)) return;
    try {
      await api(`/pos/products/${product.id}`, { method: 'DELETE' });
      toast('Product deleted');
      setCart((items) => items.filter((item) => item.product_id !== product.id));
      setSelectedProductId('');
      loadProducts();
    } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <div className="page-header">
        <div><h2>Point of Sale</h2><p>Supplements, water, merchandise — manual cash / UPI tracking</p></div>
        <button className="btn btn-ghost" onClick={() => setAddOpen(true)}>+ Add Product</button>
      </div>

      <div className="panel">
        <h3 className="mt-0">New Sale</h3>
        <div className="form-grid">
          <div className="field">
            <label>Member (optional)</label>
            <input value={memberIdentifier} onChange={(e) => setMemberIdentifier(e.target.value)} placeholder="Member ID or code — leave blank for walk-in" />
          </div>
          <div className="field">
            <label>Payment Mode</label>
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
            </select>
          </div>
        </div>

        {cart.length > 0 ? (
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Subtotal</th><th></th></tr></thead>
            <tbody>
              {cart.map((c, i) => (
                <tr key={i}>
                  <td>{c.name}</td><td>{c.qty}</td><td>{money(c.price * c.qty)}</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => removeCartItem(i)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-dim">Cart is empty</p>}

        <div className="table-toolbar" style={{ marginTop: 8 }}>
          <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({money(p.price)}, stock {p.stock})</option>)}
          </select>
          <input type="number" value={qty} min={1} style={{ width: 80 }} onChange={(e) => setQty(Number(e.target.value) || 1)} />
          <button className="btn btn-ghost btn-sm" onClick={addToCart}>+ Add to Cart</button>
        </div>
        <p><strong>Total: {money(cartTotal)}</strong></p>
        <button className="btn btn-primary" onClick={submitSale}>Complete Sale</button>
      </div>

      <div className="panel">
        <h3 className="mt-0">Products</h3>
        <table>
          <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th></th></tr></thead>
          <tbody>
            {products.length === 0 && <tr><td colSpan={5} className="empty">No products yet</td></tr>}
            {products.map((p) => (
              <tr key={p.id}><td>{p.name}</td><td>{p.category || '—'}</td><td>{money(p.price)}</td><td>{p.stock}</td><td><button className="btn btn-sm btn-danger" onClick={() => deleteProduct(p)}>Delete</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3 className="mt-0">Recent Sales</h3>
        <table>
          <thead><tr><th>Date</th><th>Member</th><th>Total</th><th>Mode</th></tr></thead>
          <tbody>
            {sales.length === 0 && <tr><td colSpan={4} className="empty">No sales yet</td></tr>}
            {sales.map((s, i) => (
              <tr key={i}><td>{s.sale_date}</td><td>{s.member_name || 'Walk-in'}</td><td>{money(s.total_amount)}</td><td>{s.payment_mode.toUpperCase()}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={addOpen} title="Add Product">
        <form onSubmit={handleAddProduct}>
          <div className="field"><label>Name *</label><input name="name" required /></div>
          <div className="form-grid">
            <div className="field"><label>Category</label><input name="category" placeholder="e.g. Supplement" /></div>
            <div className="field"><label>Price (₹) *</label><input type="number" step="0.01" name="price" required /></div>
            <div className="field"><label>Initial Stock</label><input type="number" name="stock" defaultValue={0} /></div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
