import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui';

/** Loads the exported IFC through That Open's IFC loader so users can check the handoff. */
export function IfcPreview({ url, onClose }: { url: string; onClose: () => void }) {
  const { t } = useTranslation();
  const el = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string>(t('app.loading'));
  useEffect(() => {
    let dispose: (() => void) | null = null;
    void (async () => {
      try {
        const OBC = await import('@thatopen/components');
        const components = new OBC.Components();
        const world = components.get(OBC.Worlds).create<InstanceType<typeof OBC.SimpleScene>, InstanceType<typeof OBC.OrthoPerspectiveCamera>, InstanceType<typeof OBC.SimpleRenderer>>();
        world.scene = new OBC.SimpleScene(components);
        world.scene.setup();
        world.renderer = new OBC.SimpleRenderer(components, el.current!);
        world.camera = new OBC.OrthoPerspectiveCamera(components);
        components.init();
        const fragments = components.get(OBC.FragmentsManager);
        fragments.init(await OBC.FragmentsManager.getWorker());
        world.camera.controls.addEventListener('rest', () => void fragments.core.update(true));
        fragments.list.onItemSet.add(({ value: model }) => {
          model.useCamera(world.camera.three);
          world.scene.three.add(model.object);
          void fragments.core.update(true);
        });
        const loader = components.get(OBC.IfcLoader);
        await loader.setup({ autoSetWasm: true });
        const buf = new Uint8Array(await (await fetch(url, { credentials: 'include' })).arrayBuffer());
        await loader.load(buf, true, 'export');
        await world.camera.controls.setLookAt(60, 60, 60, 0, 0, 0);
        setStatus('');
        dispose = () => components.dispose();
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => dispose?.();
  }, [url]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" role="dialog" aria-modal="true">
      <div className="relative h-full max-h-[80vh] w-full max-w-5xl overflow-hidden rounded-lg bg-panel">
        <div ref={el} className="absolute inset-0" />
        {status && <p className="absolute left-3 top-3 rounded bg-panel px-2 py-1 text-xs">{status}</p>}
        <Button className="absolute right-3 top-3" onClick={onClose}>{t('app.cancel')}</Button>
      </div>
    </div>
  );
}
