import { useState } from 'react';
import { uiImage } from '../../assets';
import { VOCATION_IDS, type VocationId } from '../../domain/value-objects/ids';
import { validateName } from '../../domain/rules/character';
import { useServices } from '../providers/services';
import { ItemIcon, PixelButton, SpriteFrame } from '../../ui/common/primitives';

export function CreateCharacter({ onBack, onCreate }: { onBack: () => void; onCreate: (name: string, vocation: VocationId) => void }) {
  const { data } = useServices();
  const [vocation, setVocation] = useState<VocationId>('knight');
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const error = validateName(name);
  const v = data.vocations[vocation];
  const spells = v.spells.map((id) => data.spells[id]!);

  return (
    <div className="fixed inset-0 overflow-y-auto bg-ink">
      <img src={uiImage('title_bg')} alt="" className="pixelated fixed inset-0 h-full w-full object-cover opacity-50" draggable={false} />
      <div className="safe-top safe-bottom safe-x relative mx-auto flex max-w-[860px] flex-col gap-3 py-4">
        <div className="flex items-center gap-2">
          <PixelButton onClick={onBack}>Voltar</PixelButton>
          <h1 className="text-outline text-2xl text-gold-light">Escolha sua vocação</h1>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Vocação">
          {VOCATION_IDS.map((id) => {
            const voc = data.vocations[id];
            const active = id === vocation;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setVocation(id)}
                className={`${active ? 'frame-parchment' : 'frame-dark'} flex flex-col items-center !border-[12px] transition-transform ${active ? 'scale-[1.02]' : 'opacity-85'}`}
                data-testid={`voc-${id}`}
              >
                <SpriteFrame sheet={voc.sprite} scale={3} walk={active} />
                <span className={`mt-1 text-lg ${active ? 'text-[#5a2e1a]' : 'text-gold-light'}`}>{voc.name}</span>
                <span className={`text-center text-[11px] leading-tight ${active ? 'text-[#6b4a30]' : 'text-muted'}`}>{voc.title}</span>
              </button>
            );
          })}
        </div>
        <div className="frame-dark">
          <p className="text-[14px] leading-snug text-parchment">{v.description}</p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <h3 className="text-[13px] text-gold">Atributos iniciais</h3>
              <div className="mt-1 grid grid-cols-2 gap-x-3 text-[12px]">
                <span>Vida: {v.base.health} (+{v.perLevel.health}/nível)</span>
                <span>Mana: {v.base.mana} (+{v.perLevel.mana}/nível)</span>
              </div>
              <ul className="mt-2 space-y-[2px] text-[12px] text-heal">
                {v.strengths.map((s) => (
                  <li key={s}>✦ {s}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[13px] text-gold">Magias</h3>
              <div className="mt-1 flex flex-col gap-1">
                {spells.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-[12px]">
                    <ItemIcon icon={s.icon} size={20} />
                    <span className="flex-1">{s.name}</span>
                    <span className="text-muted">nv {s.minLevel}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <form
          className="frame-dark flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!error) onCreate(name.trim(), vocation);
          }}
        >
          <label className="flex flex-1 flex-col gap-1 text-[13px] text-gold">
            Nome do personagem
            <input
              value={name}
              maxLength={16}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="Ex.: Aria"
              className="frame-slot !border-[6px] bg-transparent px-1 py-1 text-base text-parchment outline-none placeholder:text-muted"
              data-testid="name-input"
              autoComplete="off"
            />
            {touched && error && <span className="text-[12px] text-hp-light">{error}</span>}
          </label>
          <PixelButton type="submit" variant="gold" className="px-2 py-1 text-base" ariaLabel="Começar aventura">
            Começar aventura
          </PixelButton>
        </form>
      </div>
    </div>
  );
}
