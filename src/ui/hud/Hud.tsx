// Composição do HUD sobre o canvas. Layout próprio para toque (celular) e para desktop.
import { useLocal, useSession } from '../../integration/game-ui-bridge/hooks';
import { ItemIcon } from '../common/primitives';
import { Joystick } from '../controls/Joystick';
import { InventoryPanel } from '../inventory/InventoryPanel';
import { CharacterPanel } from '../character/CharacterPanel';
import { SpellBookPanel } from '../spells/SpellBookPanel';
import { NpcDialog, LootWindow } from '../dialogs/NpcDialog';
import { ShopPanel } from '../shops/ShopPanel';
import { DepotPanel } from '../shops/DepotPanel';
import { HelpPanel, SettingsPanel } from '../settings/SettingsPanel';
import { StatusPanel } from './StatusPanel';
import { TargetFrame } from './TargetFrame';
import { ActorMenu, InvitePrompt, PartyFrame, QuickToggles } from './Social';
import { DesktopActionBar, TouchActions } from './ActionControls';
import { DeathOverlay, FpsCounter, LevelUpToast, MessageLog, RegionBanner } from './Overlays';

function MenuButton({ icon, label, onClick, testId, hotkey }: { icon: string; label: string; onClick: () => void; testId: string; hotkey?: string }) {
  return (
    <button type="button" aria-label={label} title={hotkey ? `${label} (${hotkey})` : label} onClick={onClick} className="btn-pixel flex h-11 w-11 items-center justify-center !border-[8px]" data-testid={testId}>
      <ItemIcon icon={icon} size={22} />
    </button>
  );
}

export function Hud({ zoomBias, setZoomBias, showFps, setShowFps, showLog, setShowLog }: { zoomBias: number; setZoomBias: (v: number) => void; showFps: boolean; setShowFps: (v: boolean) => void; showLog: boolean; setShowLog: (v: boolean) => void }) {
  const session = useSession();
  const panel = useLocal((s) => s.panel);
  const touch = useLocal((s) => s.touch);
  const ready = useLocal((s) => s.ready);
  const close = () => session.setPanel(null);
  if (!ready) return null;
  return (
    <div className="hud-scale pointer-events-none absolute inset-0 z-10 select-none" data-testid="hud">
      {touch && <Joystick />}
      <div className="safe-top safe-x absolute left-0 right-0 top-0 flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <StatusPanel />
          <PartyFrame />
        </div>
        <div className="flex flex-col items-end gap-1">
        <div className="pointer-events-auto flex flex-wrap justify-end gap-1">
          <MenuButton icon="ui_bag" label="Mochila" hotkey="I" onClick={() => session.setPanel('inventory')} testId="btn-inventory" />
          <MenuButton icon="ui_char" label="Personagem" hotkey="C" onClick={() => session.setPanel('character')} testId="btn-character" />
          <MenuButton icon="ui_book" label="Grimório" hotkey="K" onClick={() => session.setPanel('spells')} testId="btn-spells" />
          <MenuButton icon="ui_gear" label="Menu" hotkey="Esc" onClick={() => session.setPanel('settings')} testId="btn-settings" />
        </div>
        <QuickToggles />
        </div>
      </div>
      <div className="absolute left-1/2 top-[calc(env(safe-area-inset-top)+92px)] -translate-x-1/2 lg:top-3">
        <div className="flex flex-col items-center gap-1">
          <TargetFrame />
          <InvitePrompt />
          <ActorMenu />
        </div>
      </div>
      {showLog && (
        <div
          className={`absolute left-[max(8px,env(safe-area-inset-left))] ${
            touch ? 'bottom-[calc(136px+env(safe-area-inset-bottom))] max-w-[calc(100vw-206px)]' : 'bottom-3 max-w-[min(440px,calc(50vw-290px))]'
          }`}
        >
          <MessageLog max={touch ? 5 : 7} />
        </div>
      )}
      {touch ? <TouchActions /> : <DesktopActionBar />}
      <RegionBanner />
      <LevelUpToast />
      {showFps && <FpsCounter />}
      <NpcDialog />
      <LootWindow />
      <ShopPanel />
      <DepotPanel />
      {panel === 'inventory' && <InventoryPanel onClose={close} />}
      {panel === 'character' && <CharacterPanel onClose={close} />}
      {panel === 'spells' && <SpellBookPanel onClose={close} />}
      {panel === 'settings' && <SettingsPanel onClose={close} zoomBias={zoomBias} setZoomBias={setZoomBias} showFps={showFps} setShowFps={setShowFps} showLog={showLog} setShowLog={setShowLog} />}
      {panel === 'help' && <HelpPanel onClose={close} touch={touch} />}
      <DeathOverlay />
    </div>
  );
}
