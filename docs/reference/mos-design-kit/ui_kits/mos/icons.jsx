const Ti = ({ name, size = 16, color = 'currentColor', style }) => (
  <i className={`ti ti-${name}`} style={{ fontSize: size, color, lineHeight: 1, display: 'inline-flex', flex: 'none', ...style }} />
);
const mkIcon = (name) => (props) => <Ti name={name} size={props.size || 16} />;
Object.assign(window, { Ti, mkIcon });
