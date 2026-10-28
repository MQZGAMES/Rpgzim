import { useEffect, useState } from 'react';
import { useLocal, useSession } from '../../integration/game-ui-bridge/hooks';
import { Panel, PixelButton } from '../common/primitives';

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 py-1 text-[13px]">
      <span className="w-20 shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="flex-1 accent-[#e0b03a]"
      />
      <span className="w-9 text-right text-muted">{Math.round(value * 100)}</span>
    </label>
  );
}

export function SettingsPanel({
  onClose,
  zoomBias,
  setZoomBias,
  showFps,
  setShowFps,
  showLog,
  setShowLog,
}: {
  onClose: () => void;
  zoomBias: number;
  setZoomBias: (v: number) => void;
  showFps: boolean;
  setShowFps: (v: boolean) => void;
  showLog: boolean;
  setShowLog: (v: boolean) => void;
}) {
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
        <input
          type="checkbox"
          checked={!s.muted}
          onChange={(e) => audio.setSettings({ muted: !e.target.checked })}
          className="h-5 w-5 accent-[#e0b03a]"
        />
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
          <PixelButton
            key={l}
            variant={zoomBias === v ? 'gold' : 'stone'}
            onClick={() => setZoomBias(v as number)}
          >
            {l}
          </PixelButton>
        ))}
      </div>
      <label className="flex items-center gap-2 py-1 text-[13px]">
        <input
          type="checkbox"
          checked={showFps}
          onChange={(e) => setShowFps(e.target.checked)}
          className="h-5 w-5 accent-[#e0b03a]"
        />
        Mostrar FPS
      </label>
      <label className="flex items-center gap-2 py-1 text-[13px]">
        <input
          type="checkbox"
          checked={showLog}
          onChange={(e) => setShowLog(e.target.checked)}
          className="h-5 w-5 accent-[#e0b03a]"
          data-testid="toggle-log"
        />
        Mostrar mensagens do jogo
      </label>
      <h3 className="mb-1 mt-3 text-[13px] text-gold">Ajudas automáticas</h3>
      <AutoOptions />
      <h3 className="mb-1 mt-3 text-[13px] text-gold">Controles</h3>
      <div className="flex flex-wrap gap-2">
        <PixelButton onClick={() => session.setPanel('hotbar')} data-testid="settings-hotbar">
          Configurar atalhos
        </PixelButton>
        <PixelButton onClick={() => session.setPanel('help')}>Como jogar</PixelButton>
      </div>
      <h3 className="mb-1 mt-3 text-[13px] text-gold">Progresso</h3>
      <p className="text-[12px] text-muted">
        O jogo salva automaticamente neste navegador (ao subir de nível, trocar equipamento, negociar e a cada
        1 min).
        {lastSaved ? ` Último salvamento: ${new Date(lastSaved).toLocaleTimeString()}.` : ''}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <PixelButton variant="gold" disabled={saving} onClick={() => void session.saveNow()}>
          {saving ? 'Salvando…' : 'Salvar agora'}
        </PixelButton>
        <PixelButton onClick={() => void session.exitToMenu()}>Salvar e sair</PixelButton>
      </div>
      <p className="mt-3 text-[11px] text-muted" data-testid="settings-version">
        Versão do jogo: {__APP_VERSION__}
      </p>
    </Panel>
  );
}

function AutoOptions() {
  const session = useSession();
  const [a, setA] = useState(session.getAuto());
  const set = (patch: Partial<typeof a>) => {
    session.setAuto(patch);
    setA(session.getAuto());
  };
  return (
    <div data-testid="auto-options">
      <label className="flex items-center gap-2 py-1 text-[13px]">
        <input
          type="checkbox"
          checked={a.autoLoot}
          onChange={(e) => set({ autoLoot: e.target.checked })}
          className="h-5 w-5 accent-[#e0b03a]"
          data-testid="auto-loot"
        />
        Pegar o loot ao alcance sozinho
      </label>
      <label className="flex items-center gap-2 py-1 text-[13px]">
        <input
          type="checkbox"
          checked={a.autoPotion}
          onChange={(e) => set({ autoPotion: e.target.checked })}
          className="h-5 w-5 accent-[#e0b03a]"
          data-testid="auto-potion"
        />
        Beber poção sozinho
      </label>
      <label className="flex items-center gap-2 py-1 text-[13px]">
        <input
          type="checkbox"
          checked={a.autoHeal}
          onChange={(e) => set({ autoHeal: e.target.checked })}
          className="h-5 w-5 accent-[#e0b03a]"
          data-testid="auto-heal"
        />
        Curar sozinho com magia (Druida: Bênção da Seiva no grupo)
      </label>
      {a.autoHeal && (
        <Slider
          label="Curar abaixo de"
          value={a.healBelow}
          onChange={(v) => set({ healBelow: Math.max(0.1, Math.min(0.95, v)) })}
        />
      )}
      {a.autoPotion && (
        <>
          <Slider
            label="Vida abaixo de"
            value={a.hpBelow}
            onChange={(v) => set({ hpBelow: Math.max(0.1, Math.min(0.9, v)) })}
          />
          <Slider
            label="Mana abaixo de"
            value={a.manaBelow}
            onChange={(v) => set({ manaBelow: Math.min(0.9, v) })}
          />
          <div className="flex flex-wrap items-center gap-2 py-1 text-[13px]">
            <span className="w-20 shrink-0">Poção</span>
            {(
              [
                ['fit', 'Que se ajusta'],
                ['small', 'Menor primeiro'],
                ['large', 'Maior primeiro'],
              ] as const
            ).map(([v, l]) => (
              <PixelButton
                key={v}
                variant={a.prefer === v ? 'gold' : 'stone'}
                onClick={() => set({ prefer: v })}
              >
                {l}
              </PixelButton>
            ))}
          </div>
        </>
      )}
    </div>
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
      {!touch && (
        <p className="mt-2 text-[12px] text-muted">
          Dica: o ataque básico é automático enquanto o alvo estiver ao alcance da sua arma.
        </p>
      )}
    </Panel>
  );
}
