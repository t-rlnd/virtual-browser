/**
 * Deblocage iOS au premier geste, partage par Protocol et le Heros.
 *
 * Sur iOS le decodeur reste inerte tant qu'aucune lecture n'a ete autorisee,
 * et les seeks ne rendent rien. `layer.unlock()` lance une lecture ; c'est
 * ensuite `onUnlock` qui remet chaque couche dans l'etat voulu (le Stage pour
 * Protocol, la position de scroll pour le Heros).
 *
 * Le tout premier geste peut survenir avant que la source ne soit chargee,
 * auquel cas play() echoue. Les ecouteurs restent donc en place jusqu'a un
 * deblocage reellement reussi.
 */
export function installUnlock(layers, onUnlock) {
  const events = ['pointerdown', 'touchstart', 'keydown'];

  const remove = () => {
    for (const event of events) window.removeEventListener(event, unlock);
  };

  const unlock = async () => {
    const unlocked = await Promise.all(layers.map((layer) => layer.unlock()));
    onUnlock();
    if (unlocked.every(Boolean)) remove();
  };

  for (const event of events) window.addEventListener(event, unlock, { passive: true });
  return remove;
}
