import { Row } from '../settingsControls.jsx';
import { mnAiInput, BtnOutline } from '../settingsPrimitives.jsx';
import { mnApiKeyStorageCopy, mnApiKeySaveOnBlur } from './apiKeyField.js';

function MnApiKeyRow({ T, label, keyField, config, onChange, onSave, onRemove }) {
  const value = config?.[keyField] || '';
  const configured = value === 'configured';
  const dirty = !!config?.[`${keyField}Dirty`];
  const copy = mnApiKeyStorageCopy(config?.keyStorage, keyField);
  return (
    <Row T={T} label={label} sub={
      <span style={copy.warn ? { color: T.ink, fontWeight: 600 } : undefined}>{copy.sub}</span>
    }>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="password"
          value={configured ? '' : value}
          onChange={e => onChange(e.target.value)}
          onBlur={e => { if (mnApiKeySaveOnBlur({ dirty, value: e.target.value })) onSave(e.target.value); }}
          placeholder={copy.placeholder || (configured ? 'Configured. Type a new key to replace it.' : 'Paste API key')}
          style={mnAiInput(T, 260)}
        />
        {copy.canRemove && <BtnOutline T={T} danger onClick={onRemove}>Remove saved key</BtnOutline>}
      </div>
    </Row>
  );
}

export { MnApiKeyRow };
