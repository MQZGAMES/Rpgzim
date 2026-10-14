import { useEffect, useState } from 'react';
import { useLocal, useSession } from '../../integration/game-ui-bridge/hooks';
import { Panel, PixelButton } from '../common/primitives';

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 py-1 text-[13px]">
      <span className="w-20 shrink-0">{label}</span>
      <input type="range" min={0} max={100} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} className="flex-1 accent-[#e0b03a]" />
      <span className="w-9 text-right text-muted">{Math.round(value * 100)}</span>
    </label>
  );
}

export function SettingsPanel({ onClose, zoomBias, setZoomBias, showFps, setShowFps }: { onClose: () => void; zoomBias: number; setZoomBias: (v: number) => void; showFps: boolean; setShowFps: (v: boolean) => void }) {
  const session = useSession();
  const audio = session.audio;
  const [s, setS] = useState(audio.getSettings());
  const saving = useLocal((l) => l.saving);
  const lastSaved = useLocal((l) => l.lastSaved);
  useEffect(() => audio.onChange(() => setS(audio.getSettings())), [audio]);
  useEffect(() => {
    session.sim.setPaused(true);
    return () => session.sim.setPaused(false);
  }, [session]);
  return (
    <Panel title="Menu (pausado)" onClose={onClose} icon="ui_gear">
      <h3 className="mb-1 text-[13px] text-gold">Áudio</h3>
      <label className="flex items-center gap-2 py-1 text-[13px]">
        <input type="checkbox" checked={!s.muted} onChange={(e) => audio.setSettings({ muted: !e.target.checked })} className="h-5 w-5 accent-[#e0b03a]" />
        Som ativado
      </label>
      <Slider label="Geral" value={s.master} onChange={(v) => audio.setSettings({ master: v })} />
      <Slider label="Efeitos" value={s.sfx} onChange={(v) => audio.setSettings({ sfx: v })} />
      <Slider label="Música" value={s.music} onChange={(v) => audio.setSettings({ music: v })} />
      <h3 className="mb-1 mt-3 text-[13px] text-gold">Tela</h3>
      <div className="flex gap-2 py-1">
        {[
          [-1, 'Perto'],
          [0, 'Normal'],
          [1, 'Longe'],
        ].map(([v, l]) => (
          <PixelButton key={l} variant={zoomBias === v ? 'gold' : 'stone'} onClick={() => setZoomBias(v as number)}>
            {l}
          </PixelButton>
        ))}
      </div>
      <label className="flex items-center gap-2 py-1 text-[13px]">
        <input type="checkbox" checked={showFps} onChange={(e) => setShowFps(e.target.checked)} className="h-5 w-5 accent-[#e0b03a]" />
        Mostrar FPS
      </label>
      <h3 className="mb-1 mt-3 text-[13px] text-gold">Progresso</h3>
      <p className="text-[12px] text-muted">
        O jogo salva automaticamente neste navegador (ao subir de nível, trocar equipamento, negociar e a cada 45 s).
        {lastSaved ? ` Último salvamento: ${new Date(lastSaved).toLocaleTimeString()}.` : ''}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <PixelButton variant="gold" disabled={saving} onClick={() => void session.saveNow()}>
          {saving ? 'Salvando…' : 'Salvar agora'}
        </PixelButton>
        <PixelButton onClick={() => void session.exitToMenu()}>Salvar e sair</PixelButton>
      </div>
    </Panel>
  );
}

export function HelpPanel({ onClose, touch }: { onClose: () => void; touch: boolean }) {
  const line = (k: string, v: string) => (
    <div className="flex gap-3 border-b border-dusk py-[3px] text-[13px]">
      <span className="w-32 shrink-0 text-gold-light">{k}</span>
      <span className="text-parchment">{v}</span>
    </div>
  );
  return (
    <Panel title="Controles" onClose={onClose} icon="ui_hand">
      <h3 className="mb-1 text-[13px] text-gold">Toque</h3>
      {line('Andar', 'Arraste no lado esquerdo (joystick) ou toque no chão')}
      {line('Alvo', 'Toque no monstro ou no botão Atacar')}
      {line('Magias', 'Botões em arco ao redor do Atacar')}
      {line('Conversar / loot', 'Toque no NPC ou no saco, ou no botão de ação')}
      <h3 className="mb-1 mt-3 text-[13px] text-gold">Teclado e mouse</h3>
      {line('WASD / setas', 'Andar (8 direções)')}
      {line('Clique', 'Andar até o ponto, selecionar alvo, falar com NPC')}
      {line('Tab / Espaço', 'Selecionar o próximo alvo')}
      {line('1 – 4', 'Magias da barra')}
      {line('5 / Q · 6 / R', 'Poção de vida · poção de mana')}
      {line('E / Enter', 'Interagir')}
      {line('I · C · K', 'Mochila · Personagem · Grimório')}
      {line('Esc', 'Fechar janelas / menu')}
      {!touch && <p className="mt-2 text-[12px] text-muted">Dica: o ataque básico é automático enquanto o alvo estiver ao alcance da sua arma.</p>}
    </Panel>
  );
}
