#!/usr/bin/env node
'use strict';

const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/tabletab',
});

async function hash(pw) {
  return bcrypt.hash(pw, 12);
}

// ─── Data ────────────────────────────────────────────────────────────────────

const ESTABLISHMENTS = [
  { name: 'Carnivore Restaurant',  address: 'Langata Road, Nairobi',       phone: '+254 20 600 5933' },
  { name: 'K1 Klub House',         address: 'Peponi Road, Westlands',      phone: '+254 20 374 5923' },
  { name: 'Java House Karen',      address: 'Karen Shopping Centre, Nairobi', phone: '+254 20 204 6000' },
];

// super_managers[i] → ESTABLISHMENTS[i]
const SUPER_MANAGERS = [
  { first_name: 'Daniel',   last_name: 'Odhiambo', email: 'daniel.odhiambo@carnivore.ke' },
  { first_name: 'Brenda',   last_name: 'Mwangi',   email: 'brenda.mwangi@k1klub.ke'      },
  { first_name: 'Kevin',    last_name: 'Njoroge',  email: 'kevin.njoroge@javakaren.ke'   },
];

// admins[i] → ESTABLISHMENTS[i], two per establishment
const ADMINS = [
  [
    { first_name: 'Grace',    last_name: 'Achieng',  email: 'grace.achieng@carnivore.ke'  },
    { first_name: 'Michael',  last_name: 'Kamau',    email: 'michael.kamau@carnivore.ke'  },
  ],
  [
    { first_name: 'Sharon',   last_name: 'Wanjiku',  email: 'sharon.wanjiku@k1klub.ke'    },
    { first_name: 'Brian',    last_name: 'Otieno',   email: 'brian.otieno@k1klub.ke'      },
  ],
  [
    { first_name: 'Christine',last_name: 'Karanja',  email: 'christine.karanja@javakaren.ke' },
    { first_name: 'James',    last_name: 'Mutuku',   email: 'james.mutuku@javakaren.ke'   },
  ],
];

// waiters[i] → ESTABLISHMENTS[i], three per establishment
const WAITERS = [
  [
    { first_name: 'Patrick',  last_name: 'Omondi',  email: 'patrick.omondi@carnivore.ke'  },
    { first_name: 'Lydia',    last_name: 'Chebet',  email: 'lydia.chebet@carnivore.ke'    },
    { first_name: 'Victor',   last_name: 'Ngugi',   email: 'victor.ngugi@carnivore.ke'    },
  ],
  [
    { first_name: 'Tabitha',  last_name: 'Nyambura',email: 'tabitha.nyambura@k1klub.ke'   },
    { first_name: 'Dennis',   last_name: 'Kosgei',  email: 'dennis.kosgei@k1klub.ke'      },
    { first_name: 'Mercy',    last_name: 'Auma',    email: 'mercy.auma@k1klub.ke'         },
  ],
  [
    { first_name: 'Samuel',   last_name: 'Mwenda',  email: 'samuel.mwenda@javakaren.ke'   },
    { first_name: 'Irene',    last_name: 'Wachira', email: 'irene.wachira@javakaren.ke'   },
    { first_name: 'Felix',    last_name: 'Sitati',  email: 'felix.sitati@javakaren.ke'    },
  ],
];

// Tables per establishment (names)
const TABLE_NAMES = [
  ['Main Hall – T1','Main Hall – T2','Main Hall – T3','Terrace – T1','Terrace – T2','VIP Room – T1','VIP Room – T2','Bar Counter – T1'],
  ['Dance Floor – T1','Dance Floor – T2','Lounge – T1','Lounge – T2','Rooftop – T1','Rooftop – T2','VIP Booth – T1','VIP Booth – T2'],
  ['Indoor – T1','Indoor – T2','Indoor – T3','Garden – T1','Garden – T2','Garden – T3','Window – T1','Window – T2'],
];

// ─── Menu data ────────────────────────────────────────────────────────────────
// Format: [ catName, catDesc, [ [subName, [ [itemName, desc, price], ... ]], ... ] ]

const MENUS = [
  // ── Carnivore Restaurant ──────────────────────────────────────────────────
  [
    ['Starters', 'Light beginnings before the feast', [
      ['Soups', [
        ['Tomato Bisque',        'Rich roasted tomato with cream & basil',    350],
        ['Oxtail Soup',          'Slow-braised oxtail in rich bone broth',    480],
        ['French Onion Soup',    'Caramelised onions, crouton, gruyère crust',420],
      ]],
      ['Salads', [
        ['Caesar Salad',         'Romaine, parmesan, croutons, Caesar dressing',   550],
        ['Garden Salad',         'Mixed greens, tomatoes, cucumber, vinaigrette',   420],
        ['Avocado & Prawn Salad','Fresh avocado, tiger prawns, mango dressing',    750],
      ]],
    ]],

    ['The Big Grill', 'Carnivore\'s legendary grilled meats', [
      ['Game Meats', [
        ['Crocodile Bites',      'Tender croc tail, spiced batter, chilli dip',   1200],
        ['Ostrich Steak',        '200g ostrich fillet, garlic butter, fries',     1500],
        ['Wildebeest Ribs',      'Slow-smoked half rack, BBQ glaze',              1800],
        ['Boar Sausages',        'House-made wild boar sausages, mustard',         950],
      ]],
      ['Regular Grills', [
        ['Nyama Choma (500g)',   'Roasted goat on the bone, kachumbari & ugali',  1200],
        ['T-Bone Steak',         '400g T-bone, chimichurri, roasted veg',         2200],
        ['Baby Back Ribs',       'Full rack, hickory-smoke, coleslaw, fries',     1800],
        ['Lamb Chops (3 pcs)',   'French-trimmed cutlets, rosemary jus',          1600],
      ]],
    ]],

    ['Local Favourites', 'Kenyan classics done right', [
      ['Rice Dishes', [
        ['Pilau',                'Spiced rice, beef, whole masala, kachumbari',   480],
        ['Chicken Biryani',      'Basmati, slow-cooked chicken, raita',           650],
        ['Coconut Rice & Stew',  'Wali wa nazi with beef stew',                   520],
      ]],
      ['Traditional Dishes', [
        ['Ugali & Nyama',        'White maize ugali, beef stew, sukuma wiki',     650],
        ['Mukimo',               'Mashed potato, peas, maize & beans',            420],
        ['Githeri Special',      'Boiled maize & beans, spiced tomato base',      380],
        ['Matumbo Wet Fry',      'Tripe sautéed in onions, tomato & spices',      450],
      ]],
    ]],

    ['Desserts', 'Sweet endings', [
      ['Hot Desserts', [
        ['Malva Pudding',        'South African sponge, apricot jam, custard',    380],
        ['Chocolate Lava Cake',  'Warm dark chocolate fondant, vanilla ice cream',450],
        ['Crepes Suzette',       'Flambéed crepes, Grand Marnier, orange zest',   500],
      ]],
      ['Cold Desserts', [
        ['Ice Cream Sundae',     'Three scoops, hot fudge, sprinkles, wafer',     320],
        ['Mango Sorbet',         'House-made fresh mango sorbet, mint',           280],
        ['Cheesecake Slice',     'New York baked, berry compote',                 380],
      ]],
    ]],

    ['Drinks', 'Beverages to complement your meal', [
      ['Soft Drinks', [
        ['Coca-Cola 300ml',      'Chilled Coke',                                  150],
        ['Sprite 300ml',         'Chilled Sprite',                                150],
        ['Fanta Orange 300ml',   'Chilled Fanta',                                 150],
        ['Still Water 500ml',    'Chilled still water',                            80],
        ['Sparkling Water 500ml','San Pellegrino sparkling',                       200],
      ]],
      ['Fresh Juices', [
        ['Fresh Orange Juice',   'Freshly squeezed oranges',                      280],
        ['Mango Juice',          'Blended fresh mango',                           250],
        ['Passion Fruit Juice',  'Blended fresh passion fruit',                   250],
        ['Watermelon Juice',     'Chilled blended watermelon',                    220],
      ]],
      ['Beers', [
        ['Tusker Lager 500ml',   'Kenya\'s favourite lager',                       280],
        ['White Cap 500ml',      'Crisp Kenyan lager',                             280],
        ['Guinness 500ml',       'Classic Irish stout',                            320],
        ['Heineken 330ml',       'Premium Dutch lager',                            380],
        ['Tusker Cider 330ml',   'Apple cider, lightly sparkling',                 300],
      ]],
    ]],
  ],

  // ── K1 Klub House ─────────────────────────────────────────────────────────
  [
    ['Bar Snacks', 'Perfect with your drinks', [
      ['Light Bites', [
        ['Chicken Wings (8 pcs)', 'Crispy wings, buffalo sauce, blue cheese dip', 750],
        ['Loaded Fries',          'Thick-cut fries, cheese sauce, jalapeños, bacon', 680],
        ['Spring Rolls (6 pcs)',  'Veggie & chicken rolls, sweet chilli dip',     520],
        ['Calamari',              'Lightly battered squid rings, tartare sauce',  780],
        ['Bruschetta (4 pcs)',    'Toasted baguette, tomato, basil, olive oil',   480],
      ]],
      ['Platters', [
        ['Mixed Platter (2 pax)', 'Wings, calamari, spring rolls, loaded fries', 1900],
        ['Nachos Supreme',        'Tortillas, jalapeños, salsa, guac, sour cream', 720],
        ['Meat Board (2 pax)',    'Sliced meats, pickles, mustard, artisan bread',1800],
      ]],
    ]],

    ['Cocktails', 'Shaken and stirred', [
      ['Classics', [
        ['Mojito',               'White rum, mint, lime, soda, brown sugar',      780],
        ['Cosmopolitan',         'Vodka, triple sec, cranberry, fresh lime',      820],
        ['Margarita',            'Tequila, triple sec, lime juice, salt rim',     780],
        ['Long Island Iced Tea', 'Vodka, rum, gin, tequila, cola',                950],
        ['Old Fashioned',        'Bourbon, bitters, sugar, orange peel',          900],
        ['Negroni',              'Gin, Campari, sweet vermouth, orange',          880],
      ]],
      ['K1 Signatures', [
        ['Sunset Strip',         'Tequila, passion fruit, grenadine, ginger beer', 880],
        ['Safari Sling',         'Gin, pineapple, coconut cream, Midori',          920],
        ['Nairobi Night',        'Dark rum, espresso, Kahlúa, salted caramel',     980],
        ['Savanna Sour',         'Bourbon, honey syrup, lemon, egg white foam',    900],
      ]],
    ]],

    ['Spirits', 'Premium pours', [
      ['Whisky', [
        ['Johnnie Walker Red (50ml)',    'Classic blended Scotch',                 480],
        ['Johnnie Walker Black (50ml)',  'Aged 12 years blended Scotch',           680],
        ['Jack Daniel\'s (50ml)',        'Tennessee whiskey, smooth & mellow',     580],
        ['Glenfiddich 12yr (50ml)',      'Single malt Speyside Scotch',            950],
        ['Jameson Irish (50ml)',         'Triple-distilled Irish whiskey',          520],
      ]],
      ['Vodka', [
        ['Smirnoff (50ml)',      'Classic triple-distilled vodka',                  380],
        ['Absolut (50ml)',       'Swedish wheat vodka, clean finish',               480],
        ['Grey Goose (50ml)',    'Premium French vodka, ultra-smooth',              780],
        ['Ciroc (50ml)',         'Grape-based French vodka',                        720],
      ]],
      ['Rum & Tequila', [
        ['Bacardi White (50ml)',  'Light Cuban-style rum',                          400],
        ['Captain Morgan (50ml)','Spiced Caribbean rum',                            440],
        ['Jose Cuervo (50ml)',   'Silver tequila, agave forward',                   480],
        ['Patron Silver (50ml)', 'Ultra-premium 100% agave tequila',                880],
      ]],
    ]],

    ['Beers', 'Cold and refreshing', [
      ['Local Beers', [
        ['Tusker Lager 500ml',   'Kenya\'s icon since 1923',                        280],
        ['White Cap 500ml',      'Crisp clean lager',                               280],
        ['Tusker Lite 330ml',    'Lower calorie, full flavour',                     280],
        ['Pilsner 500ml',        'East Africa\'s smooth pilsner',                   280],
        ['Senator Dark 500ml',   'Rich Kenyan dark beer',                           280],
      ]],
      ['Imported Beers', [
        ['Heineken 330ml',       'Dutch premium lager',                             380],
        ['Stella Artois 330ml',  'Belgian pilsner, full-bodied',                    400],
        ['Corona Extra 330ml',   'Mexican lager, lime wedge',                       420],
        ['Peroni 330ml',         'Italian crisp lager',                             420],
      ]],
    ]],

    ['Non-Alcoholic', 'Great drinks without the buzz', [
      ['Mocktails', [
        ['Virgin Mojito',         'Mint, lime, soda, sugar syrup',                 480],
        ['Strawberry Lemonade',   'Fresh strawberries, lemon, honey',              450],
        ['Blue Lagoon Mocktail',  'Blue curaçao syrup, lemon, soda',               460],
        ['Shirley Temple',        'Ginger ale, grenadine, orange juice',            420],
      ]],
      ['Soft Drinks & Energy', [
        ['Coca-Cola 300ml',      'Classic Coke',                                    180],
        ['Sprite 300ml',         'Refreshing lemon-lime',                           180],
        ['Still Water 500ml',    'Chilled still water',                             100],
        ['Red Bull 250ml',       'Energy drink',                                    380],
        ['Tonic Water',          'Premium Schweppes tonic',                         180],
      ]],
    ]],
  ],

  // ── Java House Karen ──────────────────────────────────────────────────────
  [
    ['Coffee', 'Expertly crafted coffee', [
      ['Hot Coffee', [
        ['Americano',            'Double espresso, hot water, bold & clean',       300],
        ['Espresso',             'Double shot, rich crema',                         270],
        ['Cappuccino',           'Espresso, steamed milk, thick foam',             340],
        ['Café Latte',           'Double espresso, silky steamed milk',            370],
        ['Flat White',           'Ristretto shots, microfoam milk',                370],
        ['Mocha',                'Espresso, chocolate, steamed milk, cream',       400],
        ['Macchiato',            'Espresso, dollop of milk foam',                  290],
      ]],
      ['Cold Coffee', [
        ['Iced Latte',           'Double espresso over ice, cold milk',            400],
        ['Cold Brew',            '24hr cold-steeped, smooth & low-acid',           450],
        ['Frappuccino',          'Blended coffee ice, cream, caramel drizzle',     480],
        ['Iced Mocha',           'Cold espresso, chocolate, milk, ice',            440],
        ['Nitro Cold Brew',      'Nitrogen-infused cold brew, creamy texture',     500],
      ]],
    ]],

    ['Tea & More', 'Warming teas and smoothies', [
      ['Hot Teas', [
        ['English Breakfast',    'Full-bodied black tea, milk & sugar',            240],
        ['Earl Grey',            'Bergamot black tea, lemon',                       240],
        ['Chai Latte',           'Masala spiced tea, frothy milk',                 300],
        ['Green Tea',            'Sencha, lightly brewed, honey optional',          260],
        ['Rooibos',              'Caffeine-free South African red bush tea',       260],
      ]],
      ['Smoothies & Shakes', [
        ['Berry Blast',          'Mixed berries, banana, yoghurt, honey',          520],
        ['Tropical Smoothie',    'Mango, pineapple, coconut milk, passion',        500],
        ['Mango Lassi',          'Fresh mango, yoghurt, cardamom, rose water',     460],
        ['Chocolate Shake',      'Thick chocolate milkshake, whipped cream',       480],
        ['Avocado Smoothie',     'Fresh avocado, milk, honey, vanilla',            520],
      ]],
    ]],

    ['Breakfast', 'Start your day right', [
      ['Full Breakfasts', [
        ['Full English',         'Eggs, bacon, sausage, beans, toast, mushrooms',  980],
        ['Eggs Benedict',        'Poached eggs, hollandaise, ham, English muffin', 880],
        ['Avocado Toast',        'Sourdough, smashed avocado, poached egg, chilli',780],
        ['American Pancakes',    'Stack of 3, maple syrup, fresh berries, butter', 720],
        ['Shakshuka',            'Eggs poached in spiced tomato sauce, pita',      750],
      ]],
      ['Light Bites', [
        ['Butter Croissant',     'All-butter croissant, jam & butter',             350],
        ['Blueberry Muffin',     'Freshly baked, bursting with berries',           300],
        ['Granola Bowl',         'House granola, Greek yoghurt, seasonal fruit',   480],
        ['Banana Bread (slice)', 'Moist walnut & banana loaf, butter',             320],
      ]],
    ]],

    ['All Day Dining', 'Lunch and beyond', [
      ['Sandwiches & Wraps', [
        ['Club Sandwich',        'Triple-decker, chicken, bacon, egg, fries',      750],
        ['BLT',                  'Bacon, lettuce, tomato, mayo, sourdough',        680],
        ['Chicken Caesar Wrap',  'Grilled chicken, romaine, parmesan, wrap',       700],
        ['Veggie Wrap',          'Hummus, roasted veg, feta, spinach tortilla',    630],
        ['Tuna Melt',            'Tuna mayo, cheddar, grilled sourdough',          720],
      ]],
      ['Mains', [
        ['Grilled Chicken Salad','Char-grilled chicken, mixed greens, balsamic',   850],
        ['Pasta Arrabiata',      'Penne, spicy tomato, olives, parmesan, basil',   780],
        ['Java Beef Burger',     '180g beef patty, cheese, lettuce, fries',        920],
        ['Veggie Burger',        'Black bean patty, avocado, sriracha, fries',     800],
        ['Fish & Chips',         'Beer-battered tilapia, chunky chips, tartare',   880],
      ]],
    ]],

    ['Cakes & Desserts', 'Sweet treats', [
      ['Cakes', [
        ['New York Cheesecake',  'Baked, berry compote, cream',                    450],
        ['Carrot Cake',          'Spiced, cream cheese frosting',                  420],
        ['Chocolate Fudge Cake', 'Layered dark chocolate, ganache',                450],
        ['Lemon Drizzle',        'Zesty sponge, lemon syrup glaze',                400],
      ]],
      ['Pastries & Baked', [
        ['Chocolate Brownie',    'Gooey fudge brownie, vanilla ice cream',         300],
        ['Cinnamon Roll',        'Freshly baked, cream cheese glaze',              350],
        ['Lemon Tart',           'Buttery pastry, tangy lemon curd, meringue',     380],
        ['Pain au Chocolat',     'Flaky pastry, dark chocolate filling',           320],
      ]],
    ]],
  ],
];

// ─── Seed function ────────────────────────────────────────────────────────────

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('🧹  Clearing existing seed data...');
    await client.query(`DELETE FROM order_items`);
    await client.query(`DELETE FROM orders`);
    await client.query(`DELETE FROM payments`);
    await client.query(`DELETE FROM table_sessions`);
    await client.query(`DELETE FROM tables`);
    await client.query(`DELETE FROM discounts`);
    await client.query(`DELETE FROM menu_items`);
    await client.query(`DELETE FROM sub_categories`);
    await client.query(`DELETE FROM categories`);
    await client.query(`DELETE FROM users WHERE role != 'superadmin'`);
    await client.query(`DELETE FROM establishment_daraja_credentials`);
    await client.query(`DELETE FROM establishments`);
    // Reset sequences so IDs start clean
    await client.query(`ALTER SEQUENCE establishments_id_seq RESTART WITH 1`);
    await client.query(`ALTER SEQUENCE users_id_seq RESTART WITH 2`); // 1 = superadmin
    await client.query(`ALTER SEQUENCE categories_id_seq RESTART WITH 1`);
    await client.query(`ALTER SEQUENCE sub_categories_id_seq RESTART WITH 1`);
    await client.query(`ALTER SEQUENCE menu_items_id_seq RESTART WITH 1`);
    await client.query(`ALTER SEQUENCE tables_id_seq RESTART WITH 1`);

    const smPw    = await hash('Manager@123');
    const adminPw = await hash('Admin@123');
    const waiterPw= await hash('Waiter@123');

    for (let i = 0; i < ESTABLISHMENTS.length; i++) {
      const est = ESTABLISHMENTS[i];
      console.log(`\n🏢  Seeding: ${est.name}`);

      // Establishment
      const { rows: [e] } = await client.query(
        `INSERT INTO establishments (organisation_id, name, address, phone)
         VALUES (1, $1, $2, $3) RETURNING id`,
        [est.name, est.address, est.phone]
      );
      const estId = e.id;

      // Daraja credentials row
      await client.query(
        `INSERT INTO establishment_daraja_credentials (establishment_id, business_shortcode)
         VALUES ($1, '174379')`,
        [estId]
      );

      // Super Manager
      const sm = SUPER_MANAGERS[i];
      await client.query(
        `INSERT INTO users (establishment_id, organisation_id, role, first_name, last_name, email, password_hash, must_change_password)
         VALUES ($1, 1, 'super_manager', $2, $3, $4, $5, TRUE)`,
        [estId, sm.first_name, sm.last_name, sm.email, smPw]
      );
      console.log(`   👑  Super Manager: ${sm.email}  pw: Manager@123`);

      // Admins
      for (const admin of ADMINS[i]) {
        await client.query(
          `INSERT INTO users (establishment_id, organisation_id, role, first_name, last_name, email, password_hash, must_change_password)
           VALUES ($1, 1, 'admin', $2, $3, $4, $5, TRUE)`,
          [estId, admin.first_name, admin.last_name, admin.email, adminPw]
        );
        console.log(`   🔑  Admin:         ${admin.email}  pw: Admin@123`);
      }

      // Waiters
      for (const waiter of WAITERS[i]) {
        await client.query(
          `INSERT INTO users (establishment_id, organisation_id, role, first_name, last_name, email, password_hash, must_change_password)
           VALUES ($1, 1, 'waiter', $2, $3, $4, $5, TRUE)`,
          [estId, waiter.first_name, waiter.last_name, waiter.email, waiterPw]
        );
        console.log(`   🍽️   Waiter:        ${waiter.email}  pw: Waiter@123`);
      }

      // Tables
      for (const tableName of TABLE_NAMES[i]) {
        await client.query(
          `INSERT INTO tables (establishment_id, table_name) VALUES ($1, $2)`,
          [estId, tableName]
        );
      }
      console.log(`   🪑  Tables: ${TABLE_NAMES[i].length} inserted`);

      // Menu
      let catCount = 0, scCount = 0, itemCount = 0;
      const menuDef = MENUS[i];
      for (let ci = 0; ci < menuDef.length; ci++) {
        const [catName, catDesc, subCats] = menuDef[ci];
        const { rows: [cat] } = await client.query(
          `INSERT INTO categories (establishment_id, name, description, sort_order)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [estId, catName, catDesc, ci + 1]
        );
        catCount++;

        for (let si = 0; si < subCats.length; si++) {
          const [scName, items] = subCats[si];
          const { rows: [sc] } = await client.query(
            `INSERT INTO sub_categories (category_id, name, sort_order)
             VALUES ($1, $2, $3) RETURNING id`,
            [cat.id, scName, si + 1]
          );
          scCount++;

          for (let ii = 0; ii < items.length; ii++) {
            const [iName, iDesc, iPrice] = items[ii];
            await client.query(
              `INSERT INTO menu_items (establishment_id, category_id, sub_category_id, name, description, price)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [estId, cat.id, sc.id, iName, iDesc, iPrice]
            );
            itemCount++;
          }
        }
      }
      console.log(`   🍴  Menu: ${catCount} categories, ${scCount} sub-categories, ${itemCount} items`);
    }

    await client.query('COMMIT');
    console.log('\n✅  Seed complete!\n');
    console.log('─────────────────────────────────────────────────────');
    console.log('Superadmin:    superadmin@tabletab.dev  /  Admin@123');
    console.log('Super Managers: <email above>           /  Manager@123');
    console.log('Admins:         <email above>           /  Admin@123');
    console.log('Waiters:        <email above>           /  Waiter@123');
    console.log('─────────────────────────────────────────────────────');
    console.log('Customer URLs:');
    console.log('  http://localhost:3000/menu/1?table=1   (Carnivore)');
    console.log('  http://localhost:3000/menu/2?table=9   (K1 Klub)');
    console.log('  http://localhost:3000/menu/3?table=17  (Java House)');
    console.log('─────────────────────────────────────────────────────\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌  Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
