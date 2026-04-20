import {
  EventProcessingStatus,
  InventoryMode,
  ListingStatus,
  MarketplaceEventType,
  MarketplaceType,
  PrismaClient,
  ProductStatus,
  QueuePriority,
  QueueSourceType,
  QueueStatus,
  RequestStatus,
  SyncStatus,
  UserRole,
} from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/auth/password";

const prisma = new PrismaClient();

const users = {
  admin: "user_admin",
  alex: "user_alex",
  mia: "user_mia",
} as const;

const seededUserPasswords = {
  admin: "admin123!",
  alex: "alex123!",
  mia: "mia123!",
} as const;

const filaments = {
  red: "fil_red",
  white: "fil_white",
  skin: "fil_skin",
  black: "fil_black",
  marble: "fil_marble",
  gray: "fil_gray",
  blue: "fil_blue",
} as const;

const featuredFilamentNames = {
  [filaments.red]: "Army Red",
  [filaments.white]: "Cotton White",
  [filaments.skin]: "Pastel Peach",
  [filaments.black]: "Charcoal Black",
  [filaments.marble]: "Marble Brick",
  [filaments.gray]: "Ash Grey",
  [filaments.blue]: "Sapphire Blue",
} as const;

const panchromaFilamentNames = [
  "Charcoal Black",
  "Army Red",
  "Muted Red",
  "Pastel Coral",
  "Muted Terracotta",
  "Cotton White",
  "Earth Brown",
  "Army Beige",
  "Army Brown",
  "Muted White",
  "Pastel Peanut",
  "Wood Brown",
  "Pastel Peach",
  "Sunrise Orange",
  "Pastel Beige",
  "Pastel Banana",
  "Army Light Green",
  "Savannah Yellow",
  "Muted Moss",
  "Sunshine Yellow",
  "Army Dark Green",
  "Lime Green",
  "Pastel Mint",
  "Muted Green",
  "Grass Green",
  "Forest Green",
  "Emerald Green",
  "Seafoam Green",
  "Arctic Teal",
  "Muted Teal",
  "Pastel Ice",
  "Sky Blue",
  "Sapphire Blue",
  "Army Blue",
  "Muted Blue",
  "Raspberry Blue",
  "Ash Grey",
  "Fossil Grey",
  "Pastel Pezriwinkle",
  "Army Purple",
  "Lavender Purple",
  "Electric Indigo",
  "Muted Purple",
  "Lotus Pink",
  "Pastel Candy",
  "Muted Mauve",
  "Sakura Pink",
  "Wine Burgundy",
  "Pastel Watermelon",
  "Lava Red",
  "Silk Gold",
  "Silk Silver",
  "Marble Brick",
  "Metallic Red",
  "Metallic Silver",
  "Metallic Gold",
] as const;

function createFilamentId(name: string) {
  return `fil_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

function resolveFilamentId(name: string) {
  const entry = Object.entries(featuredFilamentNames).find(([, featuredName]) => featuredName === name);
  return entry?.[0] ?? createFilamentId(name);
}

function materialTypeForFilament(name: string) {
  if (name.toLowerCase().startsWith("silk ")) {
    return "Panchroma Silk PLA";
  }

  return "Panchroma Matte PLA";
}

const products = {
  santa: "prod_santa",
  planter: "prod_planter",
  dragon: "prod_dragon",
  rack: "prod_honeycomb_rack",
  phoneStand: "prod_phone_stand",
  cableClip: "prod_cable_clip",
  lampShade: "prod_lamp_shade",
  organizer: "prod_boardgame_organizer",
  nameplate: "prod_nameplate",
  vase: "prod_vase",
} as const;

const requests = {
  santaRush: "req_santa_rush",
  planterGift: "req_planter_gift",
  dragonDesk: "req_dragon_desk",
  nameplateBatch: "req_nameplate_batch",
} as const;

function daysFromNow(days: number) {
  const dt = new Date();
  dt.setDate(dt.getDate() + days);
  return dt;
}

async function main() {
  await prisma.marketplaceEvent.deleteMany();
  await prisma.queueItem.deleteMany();
  await prisma.request.deleteMany();
  await prisma.marketplaceListing.deleteMany();
  await prisma.productFilamentRequirement.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.inventoryRecord.deleteMany();
  await prisma.product.deleteMany();
  await prisma.filament.deleteMany();
  await prisma.user.deleteMany();
  await prisma.appSetting.deleteMany();

  await prisma.appSetting.create({
    data: {
      id: "app",
      defaultMarketplace: MarketplaceType.ETSY,
    },
  });

  const [adminPasswordHash, alexPasswordHash, miaPasswordHash] = await Promise.all([
    hashPassword(seededUserPasswords.admin),
    hashPassword(seededUserPasswords.alex),
    hashPassword(seededUserPasswords.mia),
  ]);

  await prisma.user.createMany({
    data: [
      {
        id: users.admin,
        name: "Avery Print Ops",
        email: "admin@portal.local",
        passwordHash: adminPasswordHash,
        role: UserRole.ADMIN,
        isActive: true,
      },
      {
        id: users.alex,
        name: "Alex Rivera",
        email: "alex@portal.local",
        passwordHash: alexPasswordHash,
        role: UserRole.REQUEST_USER,
        isActive: true,
      },
      {
        id: users.mia,
        name: "Mia Chen",
        email: "mia@portal.local",
        passwordHash: miaPasswordHash,
        role: UserRole.REQUEST_USER,
        isActive: true,
      },
    ],
  });

  await prisma.filament.createMany({
    data: Array.from(new Set(panchromaFilamentNames)).map((name) => ({
      id: resolveFilamentId(name),
      name,
      brand: "Polymaker",
      colorLabel: name,
      materialType: materialTypeForFilament(name),
    })),
  });

  await prisma.product.createMany({
    data: [
      {
        id: products.santa,
        slug: "santa-figurine",
        internalName: "Santa Figurine v2",
        publicName: "Santa Figurine",
        shortDescription: "Holiday desk figurine with multi-color accents.",
        fullDescription:
          "A high-detail festive Santa figurine tuned for clean supports and crisp facial details. Works well as a holiday gift or seasonal shelf display.",
        category: "Seasonal Decor",
        tags: ["holiday", "figurine", "gift"],
        sku: "SANTA-FIG-V2",
        status: ProductStatus.ACTIVE,
        isPublic: true,
        isRequestable: true,
        isListable: true,
        inventoryMode: InventoryMode.MADE_TO_ORDER,
        lengthMm: 52.0,
        widthMm: 48.0,
        heightMm: 108.0,
        itemWeightGrams: 82.0,
        packagingType: "Small kraft box",
        productionNotes: "Run at 0.16 layer height for best face quality.",
        printNotes: "Tree supports under hat rim only.",
      },
      {
        id: products.planter,
        slug: "geometric-planter",
        internalName: "Hex Planter 4in",
        publicName: "Geometric Planter",
        shortDescription: "Modern planter for succulents and desktop plants.",
        fullDescription:
          "A geometric planter optimized for fast print times with strong wall structure. Includes optional drainage insert.",
        category: "Home",
        tags: ["planter", "home", "gift"],
        sku: "PLANTER-HEX-4",
        status: ProductStatus.ACTIVE,
        isPublic: true,
        isRequestable: true,
        isListable: true,
        inventoryMode: InventoryMode.STOCKED,
        lengthMm: 122.0,
        widthMm: 122.0,
        heightMm: 98.0,
        itemWeightGrams: 138.0,
        packagingType: "Medium mailer",
        productionNotes: "Use 3 walls and 12% gyroid.",
      },
      {
        id: products.dragon,
        slug: "articulated-dragon",
        internalName: "Articulated Dragon XL",
        publicName: "Articulated Dragon",
        shortDescription: "Flexible articulated dragon for collectors.",
        fullDescription:
          "An articulated dragon with smooth linked movement. Prints in-place with minimal cleanup and high visual impact.",
        category: "Collectibles",
        tags: ["dragon", "articulated", "toy"],
        sku: "DRAGON-ART-XL",
        status: ProductStatus.ACTIVE,
        isPublic: true,
        isRequestable: true,
        isListable: true,
        inventoryMode: InventoryMode.MADE_TO_ORDER,
        lengthMm: 260.0,
        widthMm: 42.0,
        heightMm: 32.0,
        itemWeightGrams: 95.0,
        packagingType: "Padded mailer",
      },
      {
        id: products.rack,
        slug: "honeycomb-tool-rack",
        internalName: "Honeycomb Tool Rack",
        publicName: "Honeycomb Tool Rack",
        shortDescription: "Wall-mounted organizer for print tools.",
        fullDescription:
          "Modular wall rack for calipers, cutters, and nozzles. Designed to expand as your tool set grows.",
        category: "Workshop",
        tags: ["organization", "workshop", "wall-mount"],
        sku: "RACK-HONEY-01",
        status: ProductStatus.ACTIVE,
        isPublic: true,
        isRequestable: false,
        isListable: true,
        inventoryMode: InventoryMode.STOCKED,
        lengthMm: 210.0,
        widthMm: 140.0,
        heightMm: 18.0,
        itemWeightGrams: 120.0,
        packagingType: "Flat box",
      },
      {
        id: products.phoneStand,
        slug: "desk-phone-stand",
        internalName: "Desk Phone Stand Mk2",
        publicName: "Desk Phone Stand",
        shortDescription: "Minimal desk stand with cable cutout.",
        fullDescription:
          "Compact desk stand with stable angle for video calls and charging cable routing.",
        category: "Accessories",
        tags: ["desk", "phone", "accessory"],
        sku: "PHONE-STAND-MK2",
        status: ProductStatus.ACTIVE,
        isPublic: true,
        isRequestable: true,
        isListable: true,
        inventoryMode: InventoryMode.STOCKED,
        lengthMm: 78.0,
        widthMm: 92.0,
        heightMm: 96.0,
        itemWeightGrams: 68.0,
        packagingType: "Small kraft box",
      },
      {
        id: products.cableClip,
        slug: "cable-management-clip-set",
        internalName: "Cable Clip Set (6)",
        publicName: "Cable Management Clip Set",
        shortDescription: "Set of six adhesive-ready cable clips.",
        fullDescription:
          "Low-profile cable clips designed for office desk setups. Ships as a six-pack.",
        category: "Accessories",
        tags: ["cable", "office", "desk"],
        sku: "CABLE-CLIP-6PK",
        status: ProductStatus.ACTIVE,
        isPublic: true,
        isRequestable: false,
        isListable: true,
        inventoryMode: InventoryMode.LIMITED,
        lengthMm: 22.0,
        widthMm: 18.0,
        heightMm: 11.0,
        itemWeightGrams: 14.0,
        packagingType: "Polybag",
      },
      {
        id: products.lampShade,
        slug: "spiral-lamp-shade",
        internalName: "Spiral Lamp Shade",
        publicName: "Spiral Lamp Shade",
        shortDescription: "Decorative printable shade for LED lamp kits.",
        fullDescription:
          "Parametric spiral shade with excellent light diffusion and premium home-office aesthetic.",
        category: "Home",
        tags: ["lamp", "decor", "home"],
        sku: "LAMP-SPIRAL-01",
        status: ProductStatus.ACTIVE,
        isPublic: false,
        isRequestable: false,
        isListable: false,
        inventoryMode: InventoryMode.MADE_TO_ORDER,
        lengthMm: 142.0,
        widthMm: 142.0,
        heightMm: 188.0,
        itemWeightGrams: 102.0,
        packagingType: "Tall box",
      },
      {
        id: products.organizer,
        slug: "board-game-token-organizer",
        internalName: "Token Organizer Modular",
        publicName: "Board Game Token Organizer",
        shortDescription: "Modular organizer for board game components.",
        fullDescription:
          "Expandable tray system for tokens, cards, and miniatures. Designed for fast setup between sessions.",
        category: "Gaming",
        tags: ["boardgame", "organizer", "tabletop"],
        sku: "GAME-ORG-MOD",
        status: ProductStatus.ACTIVE,
        isPublic: true,
        isRequestable: true,
        isListable: true,
        inventoryMode: InventoryMode.MADE_TO_ORDER,
        lengthMm: 240.0,
        widthMm: 180.0,
        heightMm: 62.0,
        itemWeightGrams: 190.0,
        packagingType: "Large mailer",
      },
      {
        id: products.nameplate,
        slug: "custom-desk-nameplate",
        internalName: "Custom Nameplate Base",
        publicName: "Custom Desk Nameplate",
        shortDescription: "Personalized desk nameplate with color insert.",
        fullDescription:
          "Customizable two-part nameplate system optimized for quick personalization and clean text.",
        category: "Office",
        tags: ["custom", "office", "gift"],
        sku: "NAMEPLATE-CUSTOM",
        status: ProductStatus.ACTIVE,
        isPublic: true,
        isRequestable: true,
        isListable: false,
        inventoryMode: InventoryMode.MADE_TO_ORDER,
        lengthMm: 162.0,
        widthMm: 44.0,
        heightMm: 34.0,
        itemWeightGrams: 52.0,
        packagingType: "Slim box",
      },
      {
        id: products.vase,
        slug: "vortex-vase",
        internalName: "Vortex Vase Slim",
        publicName: "Vortex Vase",
        shortDescription: "Decorative vase with twisted shell pattern.",
        fullDescription:
          "A lightweight spiral vase-mode design with striking curves for modern interior accents.",
        category: "Home",
        tags: ["vase", "decor", "gift"],
        sku: "VASE-VORTEX-S",
        status: ProductStatus.ACTIVE,
        isPublic: false,
        isRequestable: false,
        isListable: true,
        inventoryMode: InventoryMode.UNAVAILABLE,
        lengthMm: 94.0,
        widthMm: 94.0,
        heightMm: 180.0,
        itemWeightGrams: 48.0,
        packagingType: "Tall box",
      },
    ],
  });

  await prisma.productImage.createMany({
    data: [
      { productId: products.santa, imagePath: "/seed-images/santa-figurine-1.svg", altText: "Santa figurine front", sortOrder: 0, isPrimary: true },
      { productId: products.santa, imagePath: "/seed-images/santa-figurine-2.svg", altText: "Santa figurine side", sortOrder: 1, isPrimary: false },
      { productId: products.planter, imagePath: "/seed-images/geometric-planter-1.svg", altText: "Geometric planter", sortOrder: 0, isPrimary: true },
      { productId: products.dragon, imagePath: "/seed-images/articulated-dragon-1.svg", altText: "Articulated dragon", sortOrder: 0, isPrimary: true },
      { productId: products.rack, imagePath: "/seed-images/honeycomb-tool-rack-1.svg", altText: "Tool rack", sortOrder: 0, isPrimary: true },
      { productId: products.phoneStand, imagePath: "/seed-images/desk-phone-stand-1.svg", altText: "Phone stand", sortOrder: 0, isPrimary: true },
      { productId: products.cableClip, imagePath: "/seed-images/cable-management-clip-set-1.svg", altText: "Cable clips", sortOrder: 0, isPrimary: true },
      { productId: products.lampShade, imagePath: "/seed-images/spiral-lamp-shade-1.svg", altText: "Lamp shade", sortOrder: 0, isPrimary: true },
      { productId: products.organizer, imagePath: "/seed-images/board-game-token-organizer-1.svg", altText: "Board game organizer", sortOrder: 0, isPrimary: true },
      { productId: products.nameplate, imagePath: "/seed-images/custom-desk-nameplate-1.svg", altText: "Desk nameplate", sortOrder: 0, isPrimary: true },
      { productId: products.vase, imagePath: "/seed-images/vortex-vase-1.svg", altText: "Vortex vase", sortOrder: 0, isPrimary: true },
    ],
  });

  await prisma.productFilamentRequirement.createMany({
    data: [
      { productId: products.santa, filamentId: filaments.red, estimatedGramsPerPrint: 28, sortOrder: 0 },
      { productId: products.santa, filamentId: filaments.white, estimatedGramsPerPrint: 24, sortOrder: 1 },
      { productId: products.santa, filamentId: filaments.skin, estimatedGramsPerPrint: 18, sortOrder: 2 },
      { productId: products.santa, filamentId: filaments.black, estimatedGramsPerPrint: 6, sortOrder: 3 },
      { productId: products.planter, filamentId: filaments.marble, estimatedGramsPerPrint: 92, sortOrder: 0 },
      { productId: products.dragon, filamentId: filaments.black, estimatedGramsPerPrint: 76, sortOrder: 0 },
      { productId: products.dragon, filamentId: filaments.red, estimatedGramsPerPrint: 14, sortOrder: 1 },
      { productId: products.rack, filamentId: filaments.gray, estimatedGramsPerPrint: 82, sortOrder: 0 },
      { productId: products.phoneStand, filamentId: filaments.blue, estimatedGramsPerPrint: 58, sortOrder: 0 },
      { productId: products.cableClip, filamentId: filaments.black, estimatedGramsPerPrint: 12, sortOrder: 0 },
      { productId: products.lampShade, filamentId: filaments.white, estimatedGramsPerPrint: 98, sortOrder: 0 },
      { productId: products.organizer, filamentId: filaments.gray, estimatedGramsPerPrint: 142, sortOrder: 0 },
      { productId: products.organizer, filamentId: filaments.blue, estimatedGramsPerPrint: 44, sortOrder: 1 },
      { productId: products.nameplate, filamentId: filaments.white, estimatedGramsPerPrint: 24, sortOrder: 0 },
      { productId: products.nameplate, filamentId: filaments.red, estimatedGramsPerPrint: 8, sortOrder: 1 },
      { productId: products.vase, filamentId: filaments.marble, estimatedGramsPerPrint: 36, sortOrder: 0 },
    ],
  });

  await prisma.marketplaceListing.createMany({
    data: [
      {
        id: "list_santa_etsy",
        productId: products.santa,
        marketplaceType: MarketplaceType.ETSY,
        externalListingId: "ET-10293",
        title: "Santa Figurine - Holiday Desk Decor",
        description: "Multi-color Santa figurine with festive detail.",
        tags: ["santa", "christmas", "3dprint"],
        price: 24.99,
        externalUrl: "https://etsy.example.com/listing/ET-10293",
        status: ListingStatus.PUBLISHED,
        syncStatus: SyncStatus.IN_SYNC,
        lastSyncedAt: daysFromNow(-1),
        lastSyncMessage: "Synced successfully",
      },
      {
        id: "list_planter_etsy",
        productId: products.planter,
        marketplaceType: MarketplaceType.ETSY,
        externalListingId: "ET-20411",
        title: "Geometric Planter",
        description: "Modern geometric planter for succulents.",
        tags: ["planter", "succulent", "home"],
        price: 21.5,
        externalUrl: "https://etsy.example.com/listing/ET-20411",
        status: ListingStatus.PUBLISHED,
        syncStatus: SyncStatus.OUT_OF_SYNC,
        lastSyncedAt: daysFromNow(-3),
        lastSyncMessage: "Description changed locally",
      },
      {
        id: "list_dragon_ebay",
        productId: products.dragon,
        marketplaceType: MarketplaceType.EBAY,
        externalListingId: "EB-88722",
        title: "Articulated Dragon XL",
        description: "Flexible articulated dragon collectible.",
        tags: ["dragon", "collectible"],
        price: 29.95,
        externalUrl: "https://ebay.example.com/itm/EB-88722",
        status: ListingStatus.PUBLISHED,
        syncStatus: SyncStatus.IN_SYNC,
        lastSyncedAt: daysFromNow(-2),
      },
      {
        id: "list_rack_shopify",
        productId: products.rack,
        marketplaceType: MarketplaceType.SHOPIFY,
        externalListingId: "SH-55321",
        title: "Honeycomb Tool Rack",
        description: "Modular workshop wall organizer.",
        tags: ["organizer", "workshop"],
        price: 32.0,
        externalUrl: "https://shop.example.com/products/honeycomb-tool-rack",
        status: ListingStatus.PUBLISHED,
        syncStatus: SyncStatus.IN_SYNC,
        lastSyncedAt: daysFromNow(-1),
      },
      {
        id: "list_phone_etsy",
        productId: products.phoneStand,
        marketplaceType: MarketplaceType.ETSY,
        externalListingId: "ET-88317",
        title: "Desk Phone Stand",
        description: "Minimal desk stand with cable route.",
        tags: ["desk", "phone", "office"],
        price: 16.99,
        externalUrl: "https://etsy.example.com/listing/ET-88317",
        status: ListingStatus.PUBLISHED,
        syncStatus: SyncStatus.NEEDS_REVIEW,
        lastSyncedAt: daysFromNow(-6),
        lastSyncMessage: "Price changed externally",
      },
      {
        id: "list_cable_etsy",
        productId: products.cableClip,
        marketplaceType: MarketplaceType.ETSY,
        externalListingId: "ET-32017",
        title: "Cable Management Clip Set",
        description: "6-piece desk cable clip set.",
        tags: ["cable", "desk"],
        price: 8.75,
        externalUrl: "https://etsy.example.com/listing/ET-32017",
        status: ListingStatus.INACTIVE,
        syncStatus: SyncStatus.FAILED,
        lastSyncedAt: daysFromNow(-5),
        lastSyncMessage: "Inventory at zero; listing paused",
      },
      {
        id: "list_organizer_shopify",
        productId: products.organizer,
        marketplaceType: MarketplaceType.SHOPIFY,
        externalListingId: "SH-81290",
        title: "Board Game Token Organizer",
        description: "Modular organizer for tabletop sessions.",
        tags: ["gaming", "organizer"],
        price: 39.0,
        externalUrl: "https://shop.example.com/products/token-organizer",
        status: ListingStatus.PUBLISHED,
        syncStatus: SyncStatus.OUT_OF_SYNC,
        lastSyncedAt: daysFromNow(-8),
        lastSyncMessage: "Needs image refresh",
      },
      {
        id: "list_lamp_etsy",
        productId: products.lampShade,
        marketplaceType: MarketplaceType.ETSY,
        title: "Spiral Lamp Shade",
        description: "Decorative lamp shade",
        tags: ["lamp", "decor"],
        price: 34.5,
        status: ListingStatus.DRAFT,
        syncStatus: SyncStatus.NOT_SYNCED,
      },
    ],
  });

  await prisma.request.createMany({
    data: [
      {
        id: requests.santaRush,
        requesterUserId: users.alex,
        productId: products.santa,
        quantity: 2,
        notes: "Need these before the family holiday dinner.",
        status: RequestStatus.UNDER_REVIEW,
      },
      {
        id: requests.planterGift,
        requesterUserId: users.mia,
        productId: products.planter,
        quantity: 1,
        notes: "Gift wrap if possible.",
        status: RequestStatus.APPROVED,
        adminNotes: "Approved and queued.",
      },
      {
        id: requests.dragonDesk,
        requesterUserId: users.alex,
        productId: products.dragon,
        quantity: 1,
        notes: "Blue accents if available.",
        status: RequestStatus.QUEUED,
      },
      {
        id: requests.nameplateBatch,
        requesterUserId: users.mia,
        productId: products.nameplate,
        quantity: 4,
        notes: "Team onboarding set.",
        status: RequestStatus.SUBMITTED,
      },
    ],
  });

  await prisma.queueItem.createMany({
    data: [
      {
        id: "queue_req_planter",
        productId: products.planter,
        sourceType: QueueSourceType.REQUEST,
        sourceReferenceId: requests.planterGift,
        sourceRequestId: requests.planterGift,
        requesterUserId: users.mia,
        quantity: 1,
        status: QueueStatus.READY_TO_PRINT,
        priority: QueuePriority.NORMAL,
        dueDate: daysFromNow(2),
        notes: "Bundle with thank-you card.",
      },
      {
        id: "queue_req_dragon",
        productId: products.dragon,
        sourceType: QueueSourceType.REQUEST,
        sourceReferenceId: requests.dragonDesk,
        sourceRequestId: requests.dragonDesk,
        requesterUserId: users.alex,
        quantity: 1,
        status: QueueStatus.PRINTING,
        priority: QueuePriority.HIGH,
        dueDate: daysFromNow(1),
      },
      {
        id: "queue_marketplace_santa",
        productId: products.santa,
        sourceType: QueueSourceType.MARKETPLACE,
        sourceReferenceId: "order-etsy-99127",
        quantity: 3,
        status: QueueStatus.PENDING,
        priority: QueuePriority.URGENT,
        dueDate: daysFromNow(1),
        notes: "Marketplace bundle order",
      },
      {
        id: "queue_manual_rack",
        productId: products.rack,
        sourceType: QueueSourceType.MANUAL,
        sourceReferenceId: "ops-restock-cycle",
        quantity: 2,
        status: QueueStatus.BLOCKED,
        priority: QueuePriority.NORMAL,
        notes: "Waiting on gray filament restock.",
      },
      {
        id: "queue_restock_phone",
        productId: products.phoneStand,
        sourceType: QueueSourceType.RESTOCK,
        sourceReferenceId: "restock-2026-04",
        quantity: 6,
        status: QueueStatus.PENDING,
        priority: QueuePriority.LOW,
      },
      {
        id: "queue_complete_clips",
        productId: products.cableClip,
        sourceType: QueueSourceType.MARKETPLACE,
        sourceReferenceId: "order-etsy-97211",
        quantity: 5,
        status: QueueStatus.COMPLETED,
        priority: QueuePriority.NORMAL,
      },
    ],
  });

  await prisma.inventoryRecord.createMany({
    data: [
      { productId: products.santa, onHand: 1, reserved: 0, committed: 0, available: 1, reorderThreshold: 3 },
      { productId: products.planter, onHand: 11, reserved: 2, committed: 1, available: 8, reorderThreshold: 5 },
      { productId: products.dragon, onHand: 0, reserved: 0, committed: 1, available: -1, reorderThreshold: 2 },
      { productId: products.rack, onHand: 4, reserved: 2, committed: 1, available: 1, reorderThreshold: 4 },
      { productId: products.phoneStand, onHand: 18, reserved: 4, committed: 3, available: 11, reorderThreshold: 8 },
      { productId: products.cableClip, onHand: 0, reserved: 0, committed: 0, available: 0, reorderThreshold: 10 },
      { productId: products.organizer, onHand: 3, reserved: 1, committed: 2, available: 0, reorderThreshold: 3 },
      { productId: products.nameplate, onHand: 0, reserved: 0, committed: 0, available: 0, reorderThreshold: 6 },
      { productId: products.vase, onHand: 1, reserved: 0, committed: 0, available: 1, reorderThreshold: 2 },
    ],
  });

  await prisma.marketplaceEvent.createMany({
    data: [
      {
        id: "evt_sale_santa",
        marketplaceType: MarketplaceType.ETSY,
        eventType: MarketplaceEventType.SALE_OCCURRED,
        payloadSummary: "Order ETSY-99127: Santa Figurine x3",
        relatedListingId: "list_santa_etsy",
        relatedProductId: products.santa,
        processingStatus: EventProcessingStatus.PROCESSED,
        processingMessage: "Created queue item queue_marketplace_santa",
        processedAt: daysFromNow(-1),
      },
      {
        id: "evt_removed_cable",
        marketplaceType: MarketplaceType.ETSY,
        eventType: MarketplaceEventType.LISTING_REMOVED,
        payloadSummary: "Listing ET-32017 removed due to stock out",
        relatedListingId: "list_cable_etsy",
        relatedProductId: products.cableClip,
        processingStatus: EventProcessingStatus.PROCESSED,
        processingMessage: "Listing status set to INACTIVE",
        processedAt: daysFromNow(-2),
      },
      {
        id: "evt_changed_phone",
        marketplaceType: MarketplaceType.ETSY,
        eventType: MarketplaceEventType.LISTING_CHANGED_EXTERNALLY,
        payloadSummary: "External price edit detected on ET-88317",
        relatedListingId: "list_phone_etsy",
        relatedProductId: products.phoneStand,
        processingStatus: EventProcessingStatus.PENDING,
      },
      {
        id: "evt_shopify_org",
        marketplaceType: MarketplaceType.SHOPIFY,
        eventType: MarketplaceEventType.LISTING_CHANGED_EXTERNALLY,
        payloadSummary: "Image set changed in Shopify admin",
        relatedListingId: "list_organizer_shopify",
        relatedProductId: products.organizer,
        processingStatus: EventProcessingStatus.FAILED,
        processingMessage: "Mock sync timeout",
      },
    ],
  });

  console.log("Seed complete: users, products, filaments, listings, requests, queue, inventory, and events created.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
