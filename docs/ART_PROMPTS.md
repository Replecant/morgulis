# Моргулис — промты для генерации портретов

Промты на английском: генераторы (Midjourney, DALL·E, Stable Diffusion, Flux и др.) понимают его заметно лучше.

## Как пользоваться

1. Каждый запрос = **блок стиля** + **описание персонажа** (+ параметры генератора).
2. Сначала сгенерируйте один портрет, который понравится. Дальше используйте его как образец стиля, чтобы все портреты выглядели как одна серия:
   - Midjourney — `--sref <ссылка на картинку>`;
   - Stable Diffusion / Flux — img2img или IP-Adapter;
   - DALL·E / ChatGPT — «в том же стиле, что и предыдущее изображение».
3. Негативный промт нужен только для Stable Diffusion и Flux. В Midjourney его аналог — параметр `--no ...`.

## Технические требования к файлам

| | |
|---|---|
| Формат | PNG |
| Размер | 1024×1024 (в игре уменьшается до 96–256 px) |
| Кадр | один персонаж, голова и плечи, лицо примерно в верхней трети, вид в три четверти |
| Фон | тёмный, однотонный, дымный — без пейзажа и интерьера |
| Имя файла | `portrait_<id>.png` (id указаны ниже) |
| Куда класть | `public/art/portraits/` в репозитории или просто пришлите мне |

## Блок стиля (вставлять в каждый запрос)

```
Dark gothic dieselpunk character portrait, oil painting with visible brushstrokes, muted desaturated palette of olive drab, soot black, rust brown and bone white, lit from above by a cold dim sickly green light of a dying green sun, subtle warm amber rim light from an oil lamp, heavy chiaroscuro, film grain, grim post-apocalyptic mood, late 19th century imperial military fashion of a fictional empire with fictional insignia, head and shoulders, three-quarter view, plain dark smoky background, painterly, highly detailed weathered face, serious expression
```

**Негативный промт / `--no`:**
```
modern clothing, sci-fi armor, power armor, neon, lasers, computers, digital devices, cartoon, anime, chibi, bright saturated colors, sunny daylight, blue sky, real-world flags, union jack, crown emblem, red cross, crucifix, swastika, halo, glowing holy light, text, letters, watermark, signature, frame, border, extra fingers, deformed hands, multiple characters
```

**Параметры Midjourney (пример):** `--ar 1:1 --style raw --v 6.1`

> Лор: Моргулис — не Земля. Поэтому в негативе стоят реальные флаги, короны, красный крест и религиозные символы, а нашивки должны быть вымышленными.

---

## Отряд

**`halloway` — сержант Хэллоуэй**
```
veteran infantry sergeant in his forties, dented flat steel brodie-style helmet, rubber gas mask with round glass eyepieces reflecting faint green light, worn olive greatcoat, leather webbing and ammunition pouches, carbine sling over the shoulder, steady tired posture
```

**`pickett` — рядовой Пиккет (стрелок)**
```
gaunt young rifleman in his early twenties, sharp narrow eyes, flat steel helmet, gas mask hanging on his chest, olive greatcoat, long bolt-action rifle with a brass telescopic sight resting on his shoulder
```

**`doe` — рядовой Доу (санитар)**
```
young field medic with a kind tired face, flat steel helmet, gas mask pushed down to the neck, olive greatcoat, white armband with a single dark red stripe, canvas medical satchel, bloodstained bandages tucked in a pocket
```

## Герой (шаблон)

Подставьте пол, возраст и строку профессии. Фуражка офицера — у всех.

```
[man / woman] in their [twenties / thirties / forties / fifties], lieutenant of an oil baron's private army, dark peaked officer cap, [PROFESSION]
```

| Профессия | `[PROFESSION]` |
|---|---|
| Солдат (`pc_soldier_m/f`) | dark red officer greatcoat with tarnished brass buttons and shoulder boards, carbine with a fixed bayonet |
| Стрелок (`pc_shooter_m/f`) | olive field jacket, leather bandolier across the chest, long rifle, binoculars on a strap |
| Диверсант (`pc_saboteur_m/f`) | dark charcoal coat with turned-up collar, scarf over the lower face, sticks of dynamite on the belt, combat knife |
| Оккультист (`pc_occultist_m/f`) | black coat with tarnished brass trim, sunken intense eyes, worn notebook with strange hand-drawn symbols, sprig of dried wormwood |
| Техник (`pc_technician_m/f`) | heavy leather work apron over the uniform, brass goggles on the cap, grease-stained hands, large wrench |
| Медик (`pc_medic_m/f`) | grey uniform coat, white armband with a dark red stripe, rolled-up sleeves, surgeon's leather bag, scalpel |

## Жители Эшфорда

**`elder` — староста Иеремия Грейвз**
```
nervous elderly village headman, threadbare black frock coat, battered top hat, untidy grey beard, anxious watery eyes, fidgeting hands, forced polite smile
```

**`marta` — Марта, фонарщица**
```
weary middle-aged widow, black shawl and old bonnet, soot-stained face, holding a long lamplighter's pole with a tiny flickering flame, eyes tired but stubborn
```

**`benedict` — отец Бенедикт**
```
old tired priest of a dying faith, worn black cassock with a plain white collar, thin grey hair, deep wrinkles, melancholic gentle eyes, single candle in the darkness behind him, no religious symbols, no halo
```

**`tommy` — Томми**
```
cheeky ragged village boy about ten years old, oversized patched jacket, flat cap, dirty freckled face, mischievous grin
```

**`jeb` — старый Джеб**
```
drunk old miner, dented miner's helmet with a small brass lamp, grey stubble, red nose, squinting eyes, holding a green glass bottle, crooked grin
```

**`brem` — кузнец Брэм**
```
huge broad-shouldered village blacksmith, thick black beard, soot-covered skin, scorched leather apron, heavy forge hammer resting on his shoulder, distrustful hostile glare
```

## Противники

**`militia` — ополченец**
```
gaunt hungry peasant militiaman, patched brown clothes, flat cap, hollow cheeks, desperate frightened eyes, gripping a rusty pitchfork
```

**`fanatic` — фанатик**
```
gaunt peasant cultist with feverish fanatical eyes, ragged dark clothes, armband dyed sickly green, old muzzle-loading musket, mouth twisted in a prayer
```

**`vale` — Мордекай Вейл, демонолог**
```
gaunt demonologist, black hooded robe, pale aristocratic face half hidden in shadow, faintly glowing green eyes, thin cruel smile, holding a staff topped with an orb of sickly green fire, wisps of green smoke around him
```

**`imp` — бес**
```
small hunched winged imp creature, leathery dark crimson skin, curved bone horns, membranous wings, glowing yellow-green eyes, sharp teeth, emerging from swirling green smoke, creature portrait
```

---

## Дополнительно (по желанию)

**Фон главного меню** — размер 1536×1024 (3:2):
```
vast grim panorama at dusk, ruined gothic cathedral spires on the left, abandoned factories with tall brick chimneys and oil derricks on the right, a huge dim sickly green dying sun low in a smoky sky, fog, falling ash, dead trees and a cemetery fence in the foreground, dark gothic dieselpunk, oil painting, muted colors, cinematic, no people, no text
```

**Тест боевого спрайта.** Генераторы плохо держат одинакового персонажа в разных кадрах, поэтому это только проверка, а не готовый путь:
```
full body tactical RPG unit sprite, single soldier standing, olive greatcoat, flat steel helmet, gas mask, rifle, three-quarter top-down view from above, centered, flat plain light grey background, dark gothic dieselpunk, painterly, readable silhouette, no shadow on background
```
