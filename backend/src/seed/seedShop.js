import dotenv from 'dotenv';
import { supabase } from '../config/supabase.js';

dotenv.config();

const items = [
  {
    key: 'health_potion',
    name: 'Poção de Vida',
    description: 'Restaura 30 de HP imediatamente.',
    icon: '🧪',
    type: 'consumable',
    rarity: 'common',
    price: 50,
    effect: { hp: 30 },
  },
  {
    key: 'mana_potion',
    name: 'Poção de Mana',
    description: 'Restaura 20 de Mana (foco).',
    icon: '🔮',
    type: 'consumable',
    rarity: 'common',
    price: 40,
    effect: { mana: 20 },
  },
  {
    key: 'xp_scroll',
    name: 'Pergaminho de Sabedoria',
    description: 'Concede 100 de XP instantâneo.',
    icon: '📜',
    type: 'consumable',
    rarity: 'rare',
    price: 150,
    effect: { xp: 100 },
  },
  {
    key: 'xp_boost',
    name: 'Amuleto do Dobro de XP',
    description: 'Multiplicador de XP (cosmético/boost para integração futura).',
    icon: '🪬',
    type: 'boost',
    rarity: 'epic',
    price: 500,
    effect: { xpMultiplier: 2 },
  },
  {
    key: 'cheat_day',
    name: 'Dia de Folga',
    description: 'Recompensa de bem-estar: um dia livre sem perder o streak.',
    icon: '🎟️',
    type: 'reward',
    rarity: 'rare',
    price: 300,
    effect: {},
  },
  {
    key: 'golden_crown',
    name: 'Coroa Dourada',
    description: 'Item cosmético lendário para o perfil do herói.',
    icon: '👑',
    type: 'cosmetic',
    rarity: 'legendary',
    price: 1000,
    effect: {},
  },
];

const seed = async () => {
  console.log('🌱 Populando a loja...');

  // upsert por "key" (idempotente)
  const { error } = await supabase
    .from('shop_items')
    .upsert(items, { onConflict: 'key' });

  if (error) {
    console.error('Erro no seed:', error.message);
    process.exit(1);
  }

  for (const item of items) console.log(`   ✔ ${item.icon} ${item.name}`);
  console.log('✅ Loja populada com sucesso!');
  process.exit(0);
};

seed().catch((err) => {
  console.error('Erro no seed:', err);
  process.exit(1);
});
