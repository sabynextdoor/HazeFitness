export default function Modal({ open, onClose, title, children }) {
  return (
    <div className={`modal-backdrop${open ? ' open' : ''}`}>
      <div className="modal">
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}
