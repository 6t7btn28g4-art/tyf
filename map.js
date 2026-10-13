"use strict";

const $ = (id) => document.getElementById(id);

document.addEventListener("error", event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || image.dataset.fallbackApplied) return;
  image.dataset.fallbackApplied = "true";
  image.src = "assets/images/brand/saijo-logo.webp";
}, true);

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

/*
  酒蔵エリア外の現在地からも、選択した施設まで青い経路を表示します。
  エリア外は道路経路サービスを使い、取得できない場合は直線の案内線へ切り替えます。
*/
const PEDESTRIAN_ROUTE_ENDPOINT = "https://routing.openstreetmap.de/routed-foot/route/v1/driving";
const ROAD_ROUTE_FALLBACK_ENDPOINT = "https://router.project-osrm.org/route/v1/driving";
const LOCAL_MAP_MIN_ZOOM = 15.20;
const GLOBAL_ROUTE_MIN_ZOOM = 3.5;

/*
  座標は、ユーザー提供の「西条酒蔵通り まちあるきMAP」の位置関係を確認し、
  各施設の公開住所・地図座標に合わせて配置しています。
*/
const SAIJO_CENTER = { lng: 132.74478, lat: 34.43005 };
const AREA_RADIUS_METERS = 1800;

const SAIJO_STATION = {
  lng: 132.743606,
  lat: 34.431097,
  image: "assets/images/landmarks/saijo-station.webp",
  thumb: "assets/images/thumbs/saijo-station.webp"
};

/*
  音読さんで作成・ダウンロードしたMP3をこの名前で
  assetsaudio フォルダーへ保存してください。
  ブラウザ標準の読み上げ音声は使用しません。
*/
const ONDOKU_AUDIO_FILES = {
  sanyotsuru: "assetsaudio/sanyotsuru.mp3",
  hakubotan: "assetsaudio/hakubotan.mp3",
  saijotsuru: "assetsaudio/saijotsuru.mp3",
  kamotsuru: "assetsaudio/kamotsuru.mp3",
  kirei: "assetsaudio/kirei.mp3",
  fukubijin: "assetsaudio/fukubijin.mp3",
  kamoizumi: "assetsaudio/kamoizumi.mp3",
  kugurimon: "assetsaudio/kugurimon.mp3",
  "saijo-station": "assetsaudio/saijo-station.mp3"
};

const CAMERA_PITCH = 78;
/* ルート案内中は道路形状が読み取りやすい角度へ下げます。 */
const ROUTE_FOCUS_PITCH = 52;
const ROUTE_REQUEST_TIMEOUT_MS = 6500;
/* GPS追跡を開始したときの標準ズーム。ズーム操作後は必ずここへ戻します。 */
const INITIAL_FOLLOW_ZOOM = 18.30;

const MAP_VIEW = {
  center: [SAIJO_CENTER.lng, SAIJO_CENTER.lat],
  zoom: 16.92,
  pitch: CAMERA_PITCH,
  bearing: 0
};

/*
  起動時の乗り物演出だけ、車・電車・飛行機を大きく追いかけます。
  演出が終わると、マップを開いたときの定位置へ戻します。
*/
const TRAVEL_FOCUS_VIEW = {
  car: { zoom: 18.25, pitch: 72 },
  train: { zoom: 18.35, pitch: 72 },
  plane: { zoom: 17.45, pitch: 58 }
};

/*
  起動時の乗り物演出は、車・電車・飛行機のすべてをMapLibre地図上で行います。
  電車はOpenStreetMapの線路レイヤーから実際の線形を取得し、その線路上だけを
  JR西条駅まで走ります。800km以上では飛行機も地図に固定された弧状ルートを
  飛び、その後に実際の線路を通る電車へ乗り継ぎます。
*/
const INTRO_CAR_ROUTE = [
  /* 画面外の西南側から、道路の曲がりに合わせて酒蔵エリアへ入る。 */
  [132.73835, 34.42792],
  [132.73905, 34.42818],
  [132.73972, 34.42842],
  [132.74038, 34.42870],
  [132.74106, 34.42902],
  [132.74178, 34.42943],
  [132.74262, 34.42986],
  [132.74355, 34.43016],
  [132.74430, 34.43018],
  [SAIJO_CENTER.lng, SAIJO_CENTER.lat]
];

const INTRO_TRAIN_ROUTE = [
  /* 山陽本線をイメージし、画面外の西側からJR西条駅へ入る。 */
  [132.73815, 34.43163],
  [132.73905, 34.43156],
  [132.73996, 34.43149],
  [132.74086, 34.43141],
  [132.74173, 34.43132],
  [132.74262, 34.43123],
  [SAIJO_STATION.lng, SAIJO_STATION.lat]
];

/*
  遠目では写真を隠して、酒蔵名を建物型の目印として表示します。
  十分に拡大したときだけ写真へ切り替え、写真同士の重なりを防ぎます。
*/
const PHOTO_REVEAL_ZOOM_DESKTOP = 18.25;
const PHOTO_REVEAL_ZOOM_MOBILE = 18.50;

/*
  JR西条駅と7酒蔵・くぐり門を含む操作可能範囲です。
  maxBoundsで制限し、外側へはドラッグできません。
  境界線や透明な壁は描かず、斜め視点の遠景だけが見えます。
*/
const NAVIGATION_BOUNDS = [
  /*
    v27: カメラ中心として移動できる範囲。
    東端・南端はゆめタウン東広島を中心に置ける位置まで許可する。
  */
  [132.73995, 34.42638],
  [132.75035, 34.43195]
];

/*
  MapLibre の maxBounds は「中心」ではなく画面全体を境界内へ収めようとするため、
  NAVIGATION_BOUNDS と同じ値にすると端の施設へ実際には寄れない。
  表示用だけ余白を追加し、最終的なカメラ中心は enforceNavigationBounds() で
  NAVIGATION_BOUNDS 内へ戻す。これで外側の景色を見せながら、ゆめタウンまで移動できる。
*/
const MAPLIBRE_VIEW_BOUNDS = [
  [132.73770, 34.42485],
  [132.75305, 34.43335]
];

/* 公式まちあるきMAPと同じ番号順です。 */
const PLACES = [
  {
    id: "sanyotsuru", type: "brewery", number: "1",
    lng: 132.740825, lat: 34.429666, angle: -8, width: 40, depth: 25,
    image: "assets/images/breweries/sanyotsuru.webp",
    thumb: "assets/images/thumbs/sanyotsuru.webp",
    name: "山陽鶴酒造",
    address: "東広島市西条岡町6-9",
    description: "公式まちあるきMAPの1番。西条駅の南西側にある酒蔵です。"
  },
  {
    id: "hakubotan", type: "brewery", number: "2",
    lng: 132.745133, lat: 34.429412, angle: 2, width: 38, depth: 25,
    image: "assets/images/breweries/hakubotan.webp",
    thumb: "assets/images/thumbs/hakubotan.webp",
    name: "白牡丹酒造",
    address: "東広島市西条本町15-5",
    description: "公式まちあるきMAPの2番。酒蔵通りの南側に位置する歴史ある酒蔵です。"
  },
  {
    id: "saijotsuru", type: "brewery", number: "3",
    lng: 132.745620, lat: 34.430238, angle: -4, width: 35, depth: 23,
    image: "assets/images/breweries/saijotsuru.webp",
    thumb: "assets/images/thumbs/saijotsuru.webp",
    name: "西條鶴醸造",
    address: "東広島市西条本町9-17",
    description: "公式まちあるきMAPの3番。賀茂鶴と亀齢の間に位置する酒蔵です。"
  },
  {
    id: "kamotsuru", type: "brewery", number: "4",
    lng: 132.745402, lat: 34.430414, angle: -5, width: 44, depth: 28,
    image: "assets/images/breweries/kamotsuru.webp",
    thumb: "assets/images/thumbs/kamotsuru.webp",
    name: "賀茂鶴酒造",
    address: "東広島市西条本町9-7",
    description: "公式まちあるきMAPの4番。一号蔵直営店を目印として表示しています。"
  },
  {
    id: "kirei", type: "brewery", number: "5",
    lng: 132.746323, lat: 34.430119, angle: -8, width: 37, depth: 24,
    image: "assets/images/breweries/kirei.webp",
    thumb: "assets/images/thumbs/kirei.webp",
    name: "亀齢酒造",
    address: "東広島市西条本町8-18",
    description: "公式まちあるきMAPの5番。西條鶴の東側にある酒蔵です。"
  },
  {
    id: "fukubijin", type: "brewery", number: "6",
    lng: 132.747731, lat: 34.430674, angle: 7, width: 43, depth: 27,
    image: "assets/images/breweries/fukubijin.webp",
    thumb: "assets/images/thumbs/fukubijin.webp",
    name: "福美人酒造",
    address: "東広島市西条本町6-21",
    description: "公式まちあるきMAPの6番。酒蔵エリアの北東側に位置します。"
  },
  {
    id: "kamoizumi", type: "brewery", number: "7",
    lng: 132.748630, lat: 34.429061, angle: -8, width: 46, depth: 28,
    image: "assets/images/breweries/kamoizumi.webp",
    thumb: "assets/images/thumbs/kamoizumi.webp",
    name: "賀茂泉酒造",
    address: "東広島市西条上市町2-4",
    description: "公式まちあるきMAPの7番。くぐり門から東へ進んだ場所にある酒蔵です。"
  },
  {
    id: "kugurimon", type: "gate", number: "門",
    lng: 132.746796, lat: 34.429599, angle: 0, width: 18, depth: 9,
    image: "assets/images/landmarks/kugurimon.webp",
    thumb: "assets/images/thumbs/kugurimon.webp",
    name: "くぐり門",
    mapName: "くぐり門 ＆ 西条酒蔵通り観光案内所",
    address: "東広島市西条本町17-1周辺",
    description: "酒蔵通り観光案内所がある、酒蔵めぐりの案内拠点です。"
  },
  {
    id: "saijo-station", type: "station", number: "駅",
    lng: SAIJO_STATION.lng, lat: SAIJO_STATION.lat, angle: 0, width: 0, depth: 0,
    image: SAIJO_STATION.image,
    thumb: SAIJO_STATION.thumb,
    name: "JR西条駅",
    mapName: "JR西条駅 ＆ 東広島市観光案内所",
    secondImage: "https://higashihiroshima-kanko.jp/higashiru_wps/wp-content/uploads/2025/02/D0A7974-1024x683.jpg",
    secondImageFallback: "assets/images/landmarks/saijo-station.webp",
    secondImageLabel: "東広島市観光案内所",
    address: "東広島市西条本町12-3",
    description: "酒蔵通りの玄関口です。東広島市観光案内所はJR西条駅2階にあります。"
  }
  ,{
    id: "tourist-info-station", type: "spot", category: "information", number: "案",
    lng: 132.743735, lat: 34.431120, angle: 0, width: 0, depth: 0,
    image: "assets/images/landmarks/saijo-station.webp", includeInOverview: true, mapMarkerHidden: true, buildingAlias: "saijo-station",
    name: "東広島市観光案内所",
    address: "JR西条駅2階",
    description: "観光情報やイベント情報を確認できる、西条駅内の案内拠点です。"
  },
  {
    id: "sakagura-info", type: "spot", category: "information", number: "案",
    lng: 132.746735, lat: 34.429655, angle: 0, width: 0, depth: 0,
    image: "assets/images/landmarks/kugurimon.webp", includeInOverview: false, mapMarkerHidden: true, buildingAlias: "kugurimon",
    name: "西条酒蔵通り観光案内所",
    address: "東広島市西条本町17-1",
    description: "酒蔵通りの観光マップや、当日の案内を確認できる拠点です。"
  },
  {
    id: "kugurimon-toilet", type: "spot", category: "accessibility", number: "WC",
    lng: 132.746875, lat: 34.429555, angle: 0, width: 0, depth: 0,
    image: "assets/images/landmarks/kugurimon.webp", includeInOverview: false, mapMarkerHidden: true,
    name: "くぐり門のトイレ",
    address: "くぐり門周辺",
    description: "洋式・多目的トイレの案内がある周辺設備です。利用可能時間に注意してください。"
  },
  {
    id: "kugurimon-coffee", type: "spot", category: "rest", number: "休",
    lng: 132.746650, lat: 34.429565, angle: 0, width: 0, depth: 0,
    image: "assets/images/landmarks/kugurimon.webp", includeInOverview: false, mapMarkerHidden: true,
    name: "くぐり門珈琲店",
    address: "くぐり門東棟",
    description: "散策途中の休憩に使える、くぐり門内のカフェです。"
  },
  {
    id: "historical-square", type: "spot", category: "culture", number: "史",
    lng: 132.745350, lat: 34.429455, angle: 0, width: 0, depth: 0,
    image: "assets/images/breweries/kamotsuru.webp", includeInOverview: false, mapMarkerHidden: true,
    name: "西条本町歴史広場",
    address: "白牡丹酒造延宝蔵東側",
    description: "酒造りの歴史と文化を感じられる多目的広場です。"
  },
  {
    id: "kurara", type: "spot", category: "culture", number: "文",
    lng: 132.7424747, lat: 34.4283545, angle: 0, width: 0, depth: 0,
    image: "assets/images/nearby/kurara.webp", thumb: "assets/images/thumbs/kurara.webp", includeInOverview: true,
    name: "東広島芸術文化ホールくらら",
    address: "東広島市西条栄町7-19",
    description: "JR西条駅から徒歩圏内にある芸術文化ホールです。"
  },
  {
    id: "city-museum", type: "spot", category: "culture", number: "美",
    lng: 132.7423088, lat: 34.4271133, angle: 0, width: 0, depth: 0,
    image: "assets/images/nearby/higashihiroshima-museum.webp", thumb: "assets/images/thumbs/higashihiroshima-museum.webp", includeInOverview: true,
    name: "東広島市立美術館",
    address: "東広島市西条栄町9-1",
    description: "酒蔵めぐりと合わせて立ち寄れる、西条駅南側の美術館です。"
  },
  {
    id: "yume-town", type: "spot", category: "shopping", number: "買",
    lng: 132.7500214, lat: 34.4269265, angle: 0, width: 0, depth: 0,
    image: "assets/images/nearby/yume-town-higashihiroshima.webp", thumb: "assets/images/thumbs/yume-town-higashihiroshima.webp", includeInOverview: true,
    name: "ゆめタウン東広島",
    address: "東広島市西条土与丸1丁目5-7",
    description: "買い物や食事、休憩に利用できるショッピングセンターです。"
  }

];

const AREA_RING = [
  [132.74000, 34.42645],
  [132.74000, 34.43085],
  [132.74280, 34.43195],
  [132.74650, 34.43195],
  [132.75095, 34.43140],
  [132.75095, 34.42645],
  [132.74000, 34.42645]
];

/* まちあるきMAPの道順を参考にした、太く見やすい案内道路。 */
const WALK_ROUTES = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "駅から酒蔵通り" },
      geometry: {
        type: "LineString",
        coordinates: [
          [132.743606, 34.431020],
          [132.743780, 34.430730],
          [132.744450, 34.430520],
          [132.745402, 34.430414],
          [132.745620, 34.430238],
          [132.746323, 34.430119],
          [132.746796, 34.429599],
          [132.747650, 34.429360],
          [132.748630, 34.429061]
        ]
      }
    },
    {
      type: "Feature",
      properties: { name: "山陽鶴方面" },
      geometry: {
        type: "LineString",
        coordinates: [
          [132.743606, 34.431020],
          [132.743050, 34.430650],
          [132.742180, 34.430210],
          [132.741350, 34.429820],
          [132.740825, 34.429666]
        ]
      }
    },
    {
      type: "Feature",
      properties: { name: "白牡丹方面" },
      geometry: {
        type: "LineString",
        coordinates: [
          [132.744450, 34.430520],
          [132.744520, 34.429850],
          [132.745133, 34.429412],
          [132.746000, 34.429510],
          [132.746796, 34.429599]
        ]
      }
    },
    {
      type: "Feature",
      properties: { name: "福美人方面" },
      geometry: {
        type: "LineString",
        coordinates: [
          [132.745402, 34.430414],
          [132.746350, 34.430610],
          [132.747731, 34.430674],
          [132.748150, 34.430050],
          [132.748630, 34.429061]
        ]
      }
    }
  ]
};


/*
  7つの酒蔵・くぐり門・JR西条駅・主要周辺スポットを、歩行用の道ネットワークで接続します。
  通常時は太い白道として表示し、行き先を選んだときは同じ線形だけを青色で上書きします。
*/
const ROUTE_NODES = {
  "saijo-station": [132.743606, 34.431097],
  stationSouth: [132.743780, 34.430730],
  centralWest: [132.744450, 34.430520],
  westA: [132.743050, 34.430650],
  westB: [132.742180, 34.430210],
  westC: [132.741350, 34.429820],
  sanyotsuru: [132.740825, 34.429666],
  southA: [132.744520, 34.429850],
  hakubotan: [132.745133, 34.429412],
  kamotsuru: [132.745402, 34.430414],
  saijotsuru: [132.745620, 34.430238],
  kirei: [132.746323, 34.430119],
  gateWest: [132.746420, 34.429850],
  kugurimon: [132.746796, 34.429599],
  northEast: [132.746350, 34.430610],
  fukubijin: [132.747731, 34.430674],
  eastMid: [132.748150, 34.430050],
  eastSouth: [132.747650, 34.429360],
  kamoizumi: [132.748630, 34.429061],
  "tourist-info-station": [132.743735, 34.431120],
  "sakagura-info": [132.746735, 34.429655],
  "kugurimon-toilet": [132.746875, 34.429555],
  "kugurimon-coffee": [132.746650, 34.429565],
  "historical-square": [132.745350, 34.429455],
  boulevardNorth: [132.743650, 34.430050],
  boulevardMid: [132.743300, 34.428650],
  kurara: [132.7424747, 34.4283545],
  "city-museum": [132.7423088, 34.4271133],
  museumEast: [132.743300, 34.427120],
  cityCenterEast: [132.746050, 34.427120],
  yumeWest: [132.748650, 34.427000],
  "yume-town": [132.7500214, 34.4269265]
};

const ROUTE_EDGES = [
  ["saijo-station", "stationSouth"],
  ["stationSouth", "centralWest"],
  ["stationSouth", "westA"],
  ["westA", "westB"],
  ["westB", "westC"],
  ["westC", "sanyotsuru"],
  ["centralWest", "kamotsuru"],
  ["centralWest", "southA"],
  ["southA", "hakubotan"],
  ["kamotsuru", "saijotsuru"],
  ["saijotsuru", "kirei"],
  ["kirei", "gateWest"],
  ["gateWest", "kugurimon"],
  ["hakubotan", "kugurimon"],
  ["kamotsuru", "northEast"],
  ["northEast", "fukubijin"],
  ["fukubijin", "eastMid"],
  ["eastMid", "kamoizumi"],
  ["kugurimon", "eastSouth"],
  ["eastSouth", "kamoizumi"],
  ["saijo-station", "tourist-info-station"],
  ["kugurimon", "sakagura-info"],
  ["kugurimon", "kugurimon-toilet"],
  ["kugurimon", "kugurimon-coffee"],
  ["hakubotan", "historical-square"],
  ["stationSouth", "boulevardNorth"],
  ["boulevardNorth", "boulevardMid"],
  ["boulevardMid", "kurara"],
  ["kurara", "city-museum"],
  ["city-museum", "museumEast"],
  ["museumEast", "cityCenterEast"],
  ["cityCenterEast", "yumeWest"],
  ["yumeWest", "yume-town"]
];

function routeEdgeKey(from, to) {
  return [from, to].sort().join("|");
}

const ROUTE_NETWORK_GEOJSON = {
  type: "FeatureCollection",
  features: ROUTE_EDGES.map(([from, to]) => ({
    type: "Feature",
    properties: { from, to, edgeKey: routeEdgeKey(from, to) },
    geometry: {
      type: "LineString",
      coordinates: [ROUTE_NODES[from], ROUTE_NODES[to]]
    }
  }))
};

/*
  青いルートは、白い案内道路と「同じGeoJSON線形」を再利用します。
  これにより、拠点同士を別の直線で結ばず、白い道の真上だけを青で塗り替えます。
  将来、白道側の1辺をカーブした複数座標へ変更しても青道が自動で同じ形を使います。
*/
const ROUTE_EDGE_GEOMETRIES = new Map();
ROUTE_NETWORK_GEOJSON.features.forEach((feature) => {
  const { from, to } = feature.properties;
  const coordinates = feature.geometry.coordinates.map((coordinate) => [...coordinate]);
  ROUTE_EDGE_GEOMETRIES.set(`${from}>${to}`, coordinates);
  ROUTE_EDGE_GEOMETRIES.set(`${to}>${from}`, [...coordinates].reverse());
});

function routeEdgeKeysFromNodeIds(nodeIds) {
  if (!Array.isArray(nodeIds) || nodeIds.length < 2) return [];
  const keys = [];
  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    const from = nodeIds[index];
    const to = nodeIds[index + 1];
    if (!ROUTE_NODES[from] || !ROUTE_NODES[to]) continue;
    const key = routeEdgeKey(from, to);
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

function setSelectedWhiteRoadEdgesHidden() {
  /* v7では未使用。通常道路は常に白のまま保持します。 */
}

function coordinatesAlongWhiteRoad(nodeIds, extraNodes = {}) {
  if (!Array.isArray(nodeIds) || nodeIds.length < 2) return [];
  const coordinates = [];

  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    const from = nodeIds[index];
    const to = nodeIds[index + 1];
    let segment = ROUTE_EDGE_GEOMETRIES.get(`${from}>${to}`);

    /* 現在地など一時ノードだけは既存ネットワーク上の最寄り点へ接続します。 */
    if (!segment) {
      const fromCoordinate = routeNodePosition(from, extraNodes);
      const toCoordinate = routeNodePosition(to, extraNodes);
      if (!fromCoordinate || !toCoordinate) continue;
      segment = [fromCoordinate, toCoordinate];
    }

    segment.forEach((coordinate, segmentIndex) => {
      if (coordinates.length && segmentIndex === 0) return;
      coordinates.push([...coordinate]);
    });
  }

  return coordinates;
}

const state = {
  map: null,
  ready: false,
  userPosition: null,
  previousPosition: null,
  userMarker: null,
  watchId: null,
  followUser: true,
  firstFix: true,
  selected: null,
  markers: new Map(),
  moveTimer: null,
  nearbyPlaceIds: new Set(),
  isClampingCamera: false,
  isZooming: false,
  isAvatarReturning: false,
  avatarReturnTimer: null,
  initialMapView: null,
  initialViewLocked: false,
  userZoomGestureActive: false,
  isProgrammaticCamera: false,
  isIntroPlaying: false,
  introPlayed: false,
  introFallbackTimer: null,
  travelIntroPlayed: false,
  isTravelIntroPlaying: false,
  travelIntroTimer: null,
  travelVehicleMarker: null,
  travelAnimationFrame: null,
  travelFlightOverlay: null,
  travelMapInteractionLocked: false,
  travelReturnView: null,
  travelCameraLastPaint: 0,
  avatarWaitingForOpeningView: false,
  avatarHiddenByMapInteraction: false,
  ondokuAudio: new Audio(),
  isAudioLoading: false,
  routeStart: null,
  activeRoute: null,
  routeRequestController: null,
  routeRequestSerial: 0,
  globalRouteMode: false,
  routePlannerOpen: false,
  markerPhotoMode: null,
  markerScale: null,
  lastAvatarFacing: null,
  lastPeekSignature: "",
  lastAvatarHidden: null,
  travelCameraLastPaint: 0,
  lastGpsCameraAt: 0,
  lastGpsCameraPosition: null,
  lastStatusMessage: "",
  statusAnnounceTimer: null,
  routeCameraAnimationFrame: null,
  routeCameraSerial: 0,
  routeGlowAnimationFrame: null,
  routeAirGlowCanvas: null,
  routeAirGlowContext: null,
  lastHeadingBearing: null,
  udAutoCloseTimer: null,
  mapToastTimer: null
};

function metresBetween(a, b) {
  const radius = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const q = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function metresToLng(metres, lat) {
  return metres / (111320 * Math.cos(lat * Math.PI / 180));
}

function metresToLat(metres) {
  return metres / 110540;
}

/*
  v12: 7酒蔵の3D表現を、単一の直方体から「蔵の集合」に変更します。
  道案内の経路・青線・ルート計算には一切触れず、建物ジオメトリだけを高品質化します。
*/
const BREWERY_BUILDING_PROFILES = {
  // 山陽鶴：黒松蔵を思わせる、横長で落ち着いた低層の蔵＋直売所側の小棟。
  sanyotsuru: {
    wall: "#f1e8d8", wallAlt: "#d9cdbb", roof: "#333a3b", roofTop: "#23292a", timber: "#59402f",
    parts: [
      { x: -2.5, y: 1.0, width: 27.0, depth: 17.5, height: 9.7 },
      { x: 13.2, y: -2.2, width: 11.5, depth: 13.0, height: 7.2, alt: true },
      { x: -8.2, y: -9.5, width: 16.0, depth: 6.5, height: 5.5, timberHeight: 3.0 },
      { x: 2.5, y: 7.2, width: 8.6, depth: 5.0, height: 6.1, alt: true }
    ],
    details: [
      { kind: "porch", x: -8.0, y: -13.0, width: 10.5, depth: 3.3, base: 0, height: 3.1, color: "#5a402f" },
      { kind: "annex", x: 4.8, y: 8.0, width: 3.4, depth: 3.4, base: 0, height: 8.2, color: "#9a806b" }
    ]
  },
  // 白牡丹：延宝蔵・天保蔵をモチーフに、並ぶ二つの白壁蔵を主役にする。
  hakubotan: {
    wall: "#faf3e3", wallAlt: "#e5d9c4", roof: "#363a39", roofTop: "#252827", timber: "#684933",
    parts: [
      { x: -8.0, y: 0.6, width: 17.0, depth: 22.0, height: 11.3 },
      { x: 9.0, y: 1.2, width: 16.0, depth: 20.5, height: 10.2, alt: true },
      { x: 0.0, y: -11.5, width: 25.0, depth: 5.2, height: 5.2, timberHeight: 2.8 },
      { x: 0.0, y: 10.0, width: 10.0, depth: 4.2, height: 6.0, alt: true }
    ],
    details: [
      { kind: "porch", x: 1.0, y: -14.5, width: 9.2, depth: 3.0, base: 0, height: 3.0, color: "#674731" }
    ]
  },
  // 西條鶴：創業時の面影と、現在も使われる高いレンガ煙突を強い目印にする。
  saijotsuru: {
    wall: "#f3eadd", wallAlt: "#d8cebf", roof: "#374147", roofTop: "#252d31", timber: "#574236",
    parts: [
      { x: -4.5, y: 0.5, width: 21.5, depth: 17.2, height: 10.4 },
      { x: 9.8, y: 3.2, width: 10.0, depth: 12.0, height: 7.6, alt: true },
      { x: -6.5, y: -9.0, width: 13.5, depth: 5.6, height: 5.1, timberHeight: 2.8 }
    ],
    details: [
      { kind: "chimney", x: 12.8, y: 7.2, width: 3.0, depth: 3.0, base: 0, height: 24.5, color: "#9b4f38" },
      { kind: "porch", x: -5.8, y: -12.0, width: 7.6, depth: 2.8, base: 0, height: 2.9, color: "#503a2d" }
    ]
  },
  // 賀茂鶴：大きな白壁の蔵群と煙突。7蔵の中で最も「大きな蔵の集合」に見せる。
  kamotsuru: {
    wall: "#f8f1e0", wallAlt: "#e4d7c3", roof: "#33393a", roofTop: "#232829", timber: "#60442f",
    parts: [
      { x: -7.5, y: 0.0, width: 25.5, depth: 22.5, height: 12.7 },
      { x: 12.0, y: 2.0, width: 14.0, depth: 16.0, height: 10.0, alt: true },
      { x: -7.0, y: -12.0, width: 19.0, depth: 6.0, height: 5.8, timberHeight: 3.2 },
      { x: 10.5, y: -9.0, width: 10.0, depth: 8.0, height: 6.8, alt: true },
      { x: -15.2, y: 6.8, width: 7.6, depth: 10.8, height: 8.8, alt: true }
    ],
    details: [
      { kind: "chimney", x: 17.8, y: 10.8, width: 3.5, depth: 3.5, base: 0, height: 25.5, color: "#8b4934" },
      { kind: "porch", x: -4.5, y: -15.2, width: 10.0, depth: 3.4, base: 0, height: 3.3, color: "#5b3d2b" }
    ]
  },
  // 亀齢：密度の高い白壁蔵＋細い煙突。青みのある瓦色で他蔵と区別する。
  kirei: {
    wall: "#eef0ec", wallAlt: "#d5d8d2", roof: "#3b4c54", roofTop: "#27353b", timber: "#4d4138",
    parts: [
      { x: 3.5, y: 0.7, width: 19.0, depth: 18.0, height: 10.7 },
      { x: -10.5, y: -1.0, width: 11.5, depth: 13.0, height: 8.0, alt: true },
      { x: 3.0, y: -9.7, width: 14.5, depth: 5.2, height: 5.0, timberHeight: 3.0 }
    ],
    details: [
      { kind: "chimney", x: -13.2, y: 7.0, width: 2.7, depth: 2.7, base: 0, height: 20.5, color: "#74493b" },
      { kind: "porch", x: 2.5, y: -12.6, width: 8.2, depth: 2.8, base: 0, height: 3.0, color: "#47372e" }
    ]
  },
  // 福美人：酒造学校・恵比寿蔵展示施設のイメージを、横長の前棟＋大蔵＋煙突で表現。
  fukubijin: {
    wall: "#f5ebdd", wallAlt: "#ddd0bd", roof: "#353c3e", roofTop: "#242b2d", timber: "#66472f",
    parts: [
      { x: -2.0, y: 2.8, width: 24.0, depth: 17.5, height: 11.1 },
      { x: 13.0, y: 7.5, width: 12.0, depth: 11.5, height: 8.4, alt: true },
      { x: -8.0, y: -9.0, width: 22.0, depth: 7.2, height: 6.2, timberHeight: 3.2 },
      { x: 9.5, y: -9.0, width: 10.0, depth: 6.2, height: 5.3, alt: true },
      { x: -13.8, y: 8.6, width: 7.2, depth: 6.2, height: 7.1, alt: true }
    ],
    details: [
      { kind: "chimney", x: 16.2, y: 8.8, width: 3.0, depth: 3.0, base: 0, height: 23.0, color: "#95523a" },
      { kind: "porch", x: -5.5, y: -13.0, width: 12.0, depth: 3.1, base: 0, height: 3.1, color: "#5b3d2b" }
    ]
  },
  // 賀茂泉：酒泉館・和泉館を意識した、横に広がる複数棟と木質の強い正面。
  kamoizumi: {
    wall: "#f1eee3", wallAlt: "#d8d3c7", roof: "#34433f", roofTop: "#24302d", timber: "#574234",
    parts: [
      { x: -6.5, y: 1.0, width: 24.0, depth: 19.5, height: 10.7 },
      { x: 11.0, y: 4.5, width: 14.0, depth: 13.5, height: 8.0, alt: true },
      { x: -8.0, y: -10.8, width: 18.0, depth: 6.2, height: 5.8, timberHeight: 3.6 },
      { x: 9.0, y: -9.0, width: 13.0, depth: 7.5, height: 6.4, timberHeight: 3.5, alt: true },
      { x: -14.0, y: 7.5, width: 8.0, depth: 8.8, height: 7.3, alt: true }
    ],
    details: [
      { kind: "porch", x: -5.5, y: -14.0, width: 11.5, depth: 3.3, base: 0, height: 3.2, color: "#51392d" }
    ]
  }
};


/*
  v24: JR西条駅・くらら・東広島市立美術館・ゆめタウン東広島も、
  酒蔵と同じMapLibreの3Dオブジェクトとして表示する。
  公式情報を参考に、駅は横長の駅舎、美術館は黒い下層＋白い上層、
  ゆめタウンは4層の大型商業施設、くららは大ホールを持つ文化施設らしい
  複数ボリュームで表現する。青ルートのコードは変更しない。
*/
const FEATURED_LANDMARK_IDS = new Set(["saijo-station", "kurara", "city-museum", "yume-town"]);

const LANDMARK_BUILDING_PROFILES = {
  "saijo-station": {
    wall: "#e8edf0", wallAlt: "#d1dbe0", roof: "#69777f", roofTop: "#46545b", timber: "#3e647a",
    parts: [
      { x: 0, y: 0, width: 42, depth: 15, height: 8.2, flatRoof: true, timberHeight: 2.4 },
      { x: 5, y: 2.5, width: 22, depth: 18, height: 10.5, flatRoof: true, timberHeight: 2.8 },
      { x: -13, y: -7.2, width: 17, depth: 6.2, height: 5.2, flatRoof: true, timberHeight: 1.6 }
    ],
    details: [
      { kind: "canopy", x: 1, y: -10.0, width: 21, depth: 4.0, base: 2.7, height: 3.4, color: "#2d6792" },
      { kind: "tower", x: 15.8, y: 4.8, width: 3.4, depth: 3.4, base: 0, height: 12.6, color: "#c9d5da" },
      { kind: "sign", x: -7.0, y: -8.2, width: 7.5, depth: 1.0, base: 3.7, height: 5.1, color: "#3473a0" }
    ]
  },
  kurara: {
    wall: "#d8d5cd", wallAlt: "#b8c0c4", roof: "#626b6f", roofTop: "#4b5559", timber: "#53636b",
    parts: [
      { x: 5.0, y: 3.0, width: 28, depth: 25, height: 15.5, flatRoof: true, timberHeight: 3.0 },
      { x: -13.0, y: -1.5, width: 18, depth: 20, height: 8.2, flatRoof: true, timberHeight: 2.2 },
      { x: -3.0, y: -12.0, width: 26, depth: 6.5, height: 5.5, flatRoof: true, timberHeight: 1.7 }
    ],
    details: [
      { kind: "canopy", x: -4.0, y: -15.2, width: 16, depth: 3.8, base: 3.0, height: 3.8, color: "#7f8b8f" },
      { kind: "glass", x: -12.0, y: -8.0, width: 9.0, depth: 2.0, base: 1.8, height: 6.8, color: "#6d8f9c" }
    ]
  },
  "city-museum": {
    wall: "#f0f1ef", wallAlt: "#242b2f", roof: "#737b7f", roofTop: "#555e62", timber: "#313a3f",
    parts: [
      { x: 0, y: 0, width: 27, depth: 19, height: 4.5, flatRoof: true, timberHeight: 3.9, alt: true },
      { x: 0.5, y: 1.0, width: 22, depth: 16, height: 13.2, flatRoof: true, timberHeight: 1.5 },
      { x: -10.0, y: -7.0, width: 7.0, depth: 7.0, height: 8.2, flatRoof: true, timberHeight: 1.2 }
    ],
    details: [
      { kind: "window", x: 8.5, y: -8.5, width: 6.5, depth: 1.2, base: 4.8, height: 10.7, color: "#7895a1" },
      { kind: "canopy", x: -2.0, y: -11.3, width: 12.0, depth: 3.4, base: 3.0, height: 3.7, color: "#363f44" }
    ]
  },
  "yume-town": {
    wall: "#e9e6df", wallAlt: "#d9d4cb", roof: "#80868a", roofTop: "#656c70", timber: "#8d3a3f",
    parts: [
      { x: 0, y: 0, width: 50, depth: 29, height: 16.2, flatRoof: true, timberHeight: 2.2 },
      { x: -10, y: -18.0, width: 33, depth: 9.0, height: 7.0, flatRoof: true, timberHeight: 2.0, alt: true },
      { x: 29, y: 4.0, width: 17, depth: 19, height: 8.5, flatRoof: true, timberHeight: 2.0, alt: true }
    ],
    details: [
      { kind: "sign", x: -4, y: -15.2, width: 15.0, depth: 1.2, base: 9.5, height: 12.0, color: "#b73742" },
      { kind: "canopy", x: -10, y: -22.2, width: 18.0, depth: 3.0, base: 3.1, height: 3.8, color: "#9a4248" }
    ]
  }
};


/*
  v21: 俯瞰時に道路と酒蔵オブジェクトが重ならないよう、
  建物・建物名・写真だけを道路脇へ視覚的にずらします。
  ルート計算・道路座標・青ルートの形状は元の実座標のままです。
  値は [東西(m), 南北(m)]。正=東/北、負=西/南。
*/
const MAP_OBJECT_VISUAL_OFFSETS_METRES = {
  sanyotsuru: [-13, -11],
  hakubotan: [-2, -14],
  saijotsuru: [4, -13],
  kamotsuru: [-10, 14],
  kirei: [10, 12],
  fukubijin: [2, 15],
  kamoizumi: [13, -11],
  kugurimon: [-7, -9],
  "saijo-station": [0, 9],
  kurara: [-10, -6],
  "city-museum": [-9, -5],
  "yume-town": [-18, 14]
};

function visualPlaceLngLat(place) {
  const offset = MAP_OBJECT_VISUAL_OFFSETS_METRES[place.id];
  if (!offset) return [place.lng, place.lat];
  return [
    place.lng + metresToLng(offset[0], place.lat),
    place.lat + metresToLat(offset[1])
  ];
}

function localOffsetToLngLat(place, xMetres = 0, yMetres = 0) {
  const angle = (place.angle || 0) * Math.PI / 180;
  const rx = xMetres * Math.cos(angle) - yMetres * Math.sin(angle);
  const ry = xMetres * Math.sin(angle) + yMetres * Math.cos(angle);
  const [visualLng, visualLat] = visualPlaceLngLat(place);
  return [
    visualLng + metresToLng(rx, visualLat),
    visualLat + metresToLat(ry)
  ];
}

function rotatedPartRectangle(place, part, widthScale = 1, depthScale = 1) {
  const width = Math.max(0.8, part.width * widthScale);
  const depth = Math.max(0.8, part.depth * depthScale);
  const halfW = width / 2;
  const halfD = depth / 2;
  const localCorners = [
    [-halfW, -halfD], [halfW, -halfD], [halfW, halfD], [-halfW, halfD], [-halfW, -halfD]
  ];
  return localCorners.map(([x, y]) => localOffsetToLngLat(place, x + (part.x || 0), y + (part.y || 0)));
}

function extrusionFeature(place, part, properties = {}, widthScale = 1, depthScale = 1) {
  return {
    type: "Feature",
    properties: {
      id: place.id,
      placeType: place.type,
      base: Number(part.base || 0),
      height: Number(part.height || 0),
      color: properties.color || "#ffffff",
      role: properties.role || "body"
    },
    geometry: {
      type: "Polygon",
      coordinates: [rotatedPartRectangle(place, part, widthScale, depthScale)]
    }
  };
}

function buildGateModel(place) {
  const wall = "#76513a";
  const darkWood = "#4b3529";
  const roof = "#2c3132";
  const bodies = [
    extrusionFeature(place, { x: -5.2, y: 0, width: 3.6, depth: 5.5, height: 5.8 }, { color: wall, role: "gate-post" }),
    extrusionFeature(place, { x: 5.2, y: 0, width: 3.6, depth: 5.5, height: 5.8 }, { color: wall, role: "gate-post" }),
    extrusionFeature(place, { x: 0, y: 0, width: 14.0, depth: 3.8, base: 4.0, height: 6.2 }, { color: darkWood, role: "gate-beam" })
  ];
  const timber = [];
  const eaves = [extrusionFeature(place, { x: 0, y: 0, width: 17.0, depth: 7.2, base: 6.1, height: 6.7 }, { color: roof, role: "roof-eave" })];
  const roofs = [extrusionFeature(place, { x: 0, y: 0, width: 15.4, depth: 5.8, base: 6.7, height: 8.0 }, { color: "#1f2526", role: "roof-cap" })];
  const ridges = [extrusionFeature(place, { x: 0, y: 0, width: 11.5, depth: 0.9, base: 8.0, height: 8.35 }, { color: "#15191a", role: "roof-ridge" })];
  return { bodies, timber, eaves, roofs, ridges, details: [] };
}

function buildBreweryModel(place) {
  if (place.type === "gate") return buildGateModel(place);
  const profile = BREWERY_BUILDING_PROFILES[place.id] || LANDMARK_BUILDING_PROFILES[place.id] || {
    wall: "#f3ecdf", wallAlt: "#d9d0c2", roof: "#343c3e", roofTop: "#242b2d", timber: "#5b4231",
    parts: [{ x: 0, y: 0, width: place.width || 12, depth: place.depth || 10, height: 10.5 }], details: []
  };
  const bodies = [];
  const timber = [];
  const eaves = [];
  const roofs = [];
  const ridges = [];
  const details = [];

  profile.parts.forEach((part, index) => {
    const wallColor = part.alt ? profile.wallAlt : profile.wall;
    const bodyPart = { ...part, base: 0 };
    bodies.push(extrusionFeature(place, bodyPart, { color: wallColor, role: `body-${index}` }));

    const timberHeight = part.timberHeight === 0
      ? 0
      : Math.min(part.timberHeight ?? 2.15, part.height * 0.34);
    if (timberHeight > 0) {
      timber.push(extrusionFeature(place, { ...part, base: 0, height: timberHeight }, { color: profile.timber, role: `timber-${index}` }, 1.002, 1.002));
    }

    const eaveBase = part.height;
    if (part.flatRoof) {
      const eaveHeight = eaveBase + 0.34;
      const capHeight = eaveHeight + 0.42;
      eaves.push(extrusionFeature(place, { ...part, base: eaveBase, height: eaveHeight }, { color: profile.roof, role: `flat-eave-${index}` }, 1.035, 1.045));
      roofs.push(extrusionFeature(place, { ...part, base: eaveHeight, height: capHeight }, { color: profile.roofTop, role: `flat-roof-${index}` }, 1.0, 1.0));
    } else {
      const eaveHeight = eaveBase + 0.55;
      const capHeight = eaveHeight + Math.max(1.15, Math.min(1.75, Math.min(part.width, part.depth) * 0.075));
      eaves.push(extrusionFeature(place, { ...part, base: eaveBase, height: eaveHeight }, { color: profile.roof, role: `roof-eave-${index}` }, 1.10, 1.12));
      roofs.push(extrusionFeature(place, { ...part, base: eaveHeight, height: capHeight }, { color: profile.roofTop, role: `roof-cap-${index}` }, 0.90, 0.82));

      const ridgeAlongWidth = part.width >= part.depth;
      ridges.push(extrusionFeature(place, {
        x: part.x || 0,
        y: part.y || 0,
        width: ridgeAlongWidth ? part.width * 0.76 : 0.95,
        depth: ridgeAlongWidth ? 0.95 : part.depth * 0.76,
        base: capHeight,
        height: capHeight + 0.32
      }, { color: "#171d1e", role: `ridge-${index}` }));
    }
  });

  (profile.details || []).forEach((detail, index) => {
    details.push(extrusionFeature(place, detail, { color: detail.color || profile.timber, role: `${detail.kind || "detail"}-${index}` }));
    if (detail.kind === "chimney") {
      details.push(extrusionFeature(place, {
        ...detail,
        width: detail.width * 1.12,
        depth: detail.depth * 1.12,
        base: Math.max(0, detail.height - 0.7),
        height: detail.height + 0.35
      }, { color: "#4e3a31", role: `chimney-cap-${index}` }));
    } else if (detail.kind === "porch") {
      eaves.push(extrusionFeature(place, {
        ...detail,
        width: detail.width * 1.12,
        depth: detail.depth * 1.18,
        base: detail.height,
        height: detail.height + 0.45
      }, { color: profile.roof, role: `porch-eave-${index}` }));
    }
  });

  return { bodies, timber, eaves, roofs, ridges, details };
}

function placeFeature(place, kind) {
  /* Backward-compatible helper retained for any future layer additions. */
  const model = buildBreweryModel(place);
  const collection = kind === "roof" ? model.roofs : model.bodies;
  return collection[0] || extrusionFeature(place, {
    x: 0, y: 0, width: place.width || 8, depth: place.depth || 8, base: 0, height: 5
  }, { color: kind === "roof" ? "#293235" : "#fff6e6", role: kind });
}

function circleFeature(position, radiusMetres) {
  const coordinates = [];
  for (let i = 0; i <= 40; i += 1) {
    const angle = (i / 40) * Math.PI * 2;
    coordinates.push([
      position.lng + metresToLng(Math.cos(angle) * radiusMetres, position.lat),
      position.lat + metresToLat(Math.sin(angle) * radiusMetres)
    ]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coordinates] }
  };
}

function buildBounds() {
  const bounds = new maplibregl.LngLatBounds();
  AREA_RING.forEach((coordinate) => bounds.extend(coordinate));
  PLACES.filter((place) => place.includeInOverview !== false).forEach((place) => bounds.extend([place.lng, place.lat]));

  /* v27: 南東端のゆめタウンの3D建物と名称まで確実に画面内へ入れる余白。 */
  bounds.extend([132.75115, 34.42620]);
  return bounds;
}

function placeTypeLabel(place) {
  if (place.type === "station") return "交通拠点";
  if (place.type === "gate") return "案内拠点";
  if (place.type === "spot") return "周辺スポット";
  return "酒蔵";
}

function overviewPadding() {
  /*
    7番・賀茂泉酒造は画面右下にあるため、右と下の余白を広めに取ります。
    HTMLマーカーの文字まで含めて見切れない初期表示にします。
  */
  if (window.matchMedia("(max-width: 720px)").matches) {
    return { top: 170, right: 58, bottom: 132, left: 42 };
  }
  return { top: 176, right: 104, bottom: 138, left: 86 };
}

function setStatus(message) {
  const live = $("screenReaderStatus");
  if (!live || !message || message === state.lastSilentStatus) return;
  state.lastSilentStatus = message;
  live.textContent = message;
}

function showMapToast(message, duration = 2400) {
  const toast = $("mapToast");
  if (!toast || !message) return;
  window.clearTimeout(state.mapToastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  state.mapToastTimer = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, duration);
}

function isRoadLayer(layer) {
  const key = `${layer.id || ""} ${layer["source-layer"] || ""}`.toLowerCase();
  return /road|street|transportation|highway|motorway|trunk|primary|secondary|tertiary|residential|service|living|path|footway|pedestrian|cycleway|bridge|tunnel/.test(key);
}

function customizeBaseStyle() {
  const layers = state.map.getStyle()?.layers || [];

  layers.forEach((layer) => {
    const id = (layer.id || "").toLowerCase();
    const sourceLayer = (layer["source-layer"] || "").toLowerCase();
    const key = `${id} ${sourceLayer}`;

    try {
      /* 建物名・道路名・施設名など、文字とアイコンをすべて消す。 */
      if (layer.type === "symbol") {
        state.map.setLayoutProperty(layer.id, "visibility", "none");
        return;
      }

      /* 元地図の建物は消し、7酒蔵とくぐり門だけ後から描く。 */
      if (layer.type === "fill-extrusion") {
        state.map.setLayoutProperty(layer.id, "visibility", "none");
        return;
      }

      if (layer.type === "background") {
        state.map.setPaintProperty(layer.id, "background-color", "#dcefdc");
        return;
      }

      if (layer.type === "fill") {
        if (/building/.test(key)) {
          state.map.setLayoutProperty(layer.id, "visibility", "none");
        } else if (/water/.test(key)) {
          state.map.setPaintProperty(layer.id, "fill-color", "#8fd8e8");
          state.map.setPaintProperty(layer.id, "fill-opacity", 0.70);
        } else if (/park|grass|landcover|landuse|wood|forest|farmland|meadow/.test(key)) {
          state.map.setPaintProperty(layer.id, "fill-color", "#b7e3a3");
          state.map.setPaintProperty(layer.id, "fill-opacity", 0.66);
        } else {
          state.map.setPaintProperty(layer.id, "fill-opacity", 0.08);
        }
        return;
      }

      if (layer.type === "line") {
        /* 実際の地図上の線路を、電車が通る場所として分かりやすく残します。 */
        if (/rail|railway/.test(key)) {
          state.map.setPaintProperty(layer.id, "line-color", "#3f4b55");
          state.map.setPaintProperty(layer.id, "line-opacity", 0.88);
          state.map.setPaintProperty(layer.id, "line-width", [
            "interpolate", ["linear"], ["zoom"],
            12, 2.2,
            15, 3.8,
            17, 5.4,
            19, 7.2
          ]);
          return;
        }

        if (!isRoadLayer(layer)) {
          if (/waterway|river|stream/.test(key)) {
            state.map.setPaintProperty(layer.id, "line-color", "#74c8dd");
            state.map.setPaintProperty(layer.id, "line-opacity", 0.58);
            state.map.setPaintProperty(layer.id, "line-width", 2);
          } else {
            state.map.setPaintProperty(layer.id, "line-opacity", 0.05);
          }
          return;
        }

        const isPath = /path|footway|pedestrian|steps|cycleway/.test(key);
        const isMajor = /motorway|trunk|primary/.test(key);
        const isCasing = /casing|outline/.test(key);

        state.map.setPaintProperty(
          layer.id,
          "line-color",
          isCasing ? "#7f8c95" : "#ffffff"
        );
        state.map.setPaintProperty(layer.id, "line-opacity", isCasing ? 0.82 : 0.98);

        /*
          浅いカメラ角度でも、奥にある道路が細く消えないようにします。
          特にズームアウト側（15前後）の線幅を大きく保ちます。
        */
        const widthAtZoom = isCasing
          ? [
              "interpolate", ["linear"], ["zoom"],
              /* 遠景側はv27と同じ太さ。 */
              12, isPath ? 7.4 : (isMajor ? 19.0 : 13.5),
              14, isPath ? 10.0 : (isMajor ? 24.0 : 17.5),
              16, isPath ? 13.5 : (isMajor ? 31.5 : 24.0),
              18.0, isPath ? 16.83 : (isMajor ? 39.83 : 30.33),
              /* 写真が見え始める距離から、ポケモンGO風に道路の比率を大きくする。 */
              18.25, isPath ? 24.0 : (isMajor ? 54.0 : 42.0),
              20, isPath ? 28.5 : (isMajor ? 64.0 : 49.0)
            ]
          : [
              "interpolate", ["linear"], ["zoom"],
              12, isPath ? 5.6 : (isMajor ? 15.0 : 10.5),
              14, isPath ? 7.8 : (isMajor ? 19.5 : 14.0),
              16, isPath ? 10.8 : (isMajor ? 26.5 : 19.5),
              18.0, isPath ? 13.6 : (isMajor ? 33.5 : 24.83),
              18.25, isPath ? 19.5 : (isMajor ? 46.0 : 35.0),
              20, isPath ? 23.5 : (isMajor ? 54.0 : 41.0)
            ];

        state.map.setPaintProperty(layer.id, "line-width", widthAtZoom);
      }
    } catch (error) {
      console.debug("Base style layer skipped:", layer.id, error);
    }
  });
}

function addSceneryDepth() {
  /*
    画面上に壁や境界線は描きません。
    元地図のラベルと一般建物を消し、緑地・水辺・遠景だけを残します。
    カメラ中心だけをコードで制限し、酒蔵エリア内は自由にドラッグできます。
  */
}

function addWideRoads() {
  /*
    v8: 独自の直線道路は描きません。
    OpenFreeMap / OpenStreetMap の実際の道路レイヤーを customizeBaseStyle() で白く太くし、
    道路本来のカーブ・交差点・細街路の形をそのまま使います。
    青い案内ルートは選択時だけ、その実道路に沿ったGeoJSONを上から細く重ねます。
  */
}


function addTravelAnimationLayers() {
  state.map.addSource("travel-map-route", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] }
  });

  /* 車：実際の地図の道路に重ねる、控えめな青い走行ライン。 */
  state.map.addLayer({
    id: "travel-map-route-casing",
    type: "line",
    source: "travel-map-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#073b66",
      "line-opacity": 0,
      "line-width": ["interpolate", ["linear"], ["zoom"], 14, 10, 18, 19]
    }
  });

  state.map.addLayer({
    id: "travel-map-route-main",
    type: "line",
    source: "travel-map-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#35b7ff",
      "line-opacity": 0,
      "line-width": ["interpolate", ["linear"], ["zoom"], 14, 5.5, 18, 11.5]
    }
  });

  /* 電車：線路の路盤、左右のレール、枕木を別レイヤーで描く。 */
  state.map.addLayer({
    id: "travel-map-rail-bed",
    type: "line",
    source: "travel-map-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#d7dde2",
      "line-opacity": 0,
      "line-width": ["interpolate", ["linear"], ["zoom"], 14, 10, 18, 18]
    }
  });

  state.map.addLayer({
    id: "travel-map-rail-left",
    type: "line",
    source: "travel-map-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#33434d",
      "line-opacity": 0,
      "line-width": ["interpolate", ["linear"], ["zoom"], 14, 1.8, 18, 3.2],
      "line-offset": ["interpolate", ["linear"], ["zoom"], 14, -2.4, 18, -4.2]
    }
  });

  state.map.addLayer({
    id: "travel-map-rail-right",
    type: "line",
    source: "travel-map-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#33434d",
      "line-opacity": 0,
      "line-width": ["interpolate", ["linear"], ["zoom"], 14, 1.8, 18, 3.2],
      "line-offset": ["interpolate", ["linear"], ["zoom"], 14, 2.4, 18, 4.2]
    }
  });

  state.map.addLayer({
    id: "travel-map-rail-sleepers",
    type: "symbol",
    source: "travel-map-route",
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 22,
      "text-field": "━",
      "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 18, 16],
      "text-rotation-alignment": "map",
      "text-pitch-alignment": "map",
      "text-rotate": 90,
      "text-allow-overlap": true,
      "text-ignore-placement": true
    },
    paint: {
      "text-color": "#6c5c4e",
      "text-opacity": 0,
      "text-halo-color": "rgba(255,255,255,.65)",
      "text-halo-width": 0.6
    }
  });

  /* 飛行機もDOMの別画面ではなく、地図座標に固定した弧状ルート上を飛ばします。 */
  state.map.addSource("travel-map-flight-route", {
    type: "geojson",
    lineMetrics: true,
    data: { type: "FeatureCollection", features: [] }
  });

  state.map.addLayer({
    id: "travel-map-flight-shadow",
    type: "line",
    source: "travel-map-flight-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#0b3b64",
      "line-opacity": 0,
      "line-width": ["interpolate", ["linear"], ["zoom"], 14, 8, 18, 15],
      "line-blur": 3
    }
  });

  state.map.addLayer({
    id: "travel-map-flight-main",
    type: "line",
    source: "travel-map-flight-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#ffffff",
      "line-opacity": 0,
      "line-width": ["interpolate", ["linear"], ["zoom"], 14, 3.2, 18, 6],
      "line-dasharray": [2.4, 2.2]
    }
  });
}

function addActiveRouteLayers() {
  /*
    プロ向け案内地図に合わせ、青は白い道路よりかなり細くします。
    白い実道路が左右に残るため、ルートが道路中央を通っていることが分かります。
  */
  state.map.addSource("active-blue-route", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] }
  });

  state.map.addLayer({
    id: "active-blue-route-glow",
    type: "line",
    source: "active-blue-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#70c8ff",
      "line-opacity": 0,
      "line-width": ["interpolate", ["linear"], ["zoom"], 12, 28, 14, 30, 16, 34, 17.5, 38, 18.24, 41, 20, 44],
      "line-blur": 7
    }
  });

  state.map.addLayer({
    id: "active-blue-route-line",
    type: "line",
    source: "active-blue-route",
    layout: {
      "line-cap": "round",
      "line-join": "round"
    },
    paint: {
      "line-color": "#1769e0",
      "line-opacity": 0.96,
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        12, 10.0,
        14, 11.5,
        16, 13.5,
        18, 16.5,
        18.25, 19.5,
        20, 23.5
      ],
      "line-blur": 0
    }
  });
}


function ensureActiveRouteOnTop() {
  if (!state.map) return;
  const routeId = "active-blue-route-line";
  const glowId = "active-blue-route-glow";
  if (!state.map.getLayer(routeId)) return;
  try {
    state.map.setLayoutProperty(routeId, "visibility", "visible");
    if (state.map.getLayer(glowId)) state.map.setLayoutProperty(glowId, "visibility", "visible");
    const firstBuildingLayer = [
      "featured-building-body", "featured-building-timber", "featured-building-roof-eave",
      "featured-building-roof", "featured-building-roof-ridge", "featured-building-detail"
    ].find((layerId) => state.map.getLayer(layerId));
    if (firstBuildingLayer) {
      if (state.map.getLayer(glowId)) state.map.moveLayer(glowId, firstBuildingLayer);
      state.map.moveLayer(routeId, firstBuildingLayer);
    } else {
      if (state.map.getLayer(glowId)) state.map.moveLayer(glowId);
      state.map.moveLayer(routeId);
    }
  } catch (error) {
    console.debug("Route layer could not be positioned:", routeId, error);
  }
}


/*
  斜め3D表示では、MapLibreのlineレイヤーを最上位へ移動しても
  fill-extrusion（3D建物）の深度判定で道路の一部が隠れることがあります。

  そのため選択中の経路だけ、同じ地理座標を画面座標へ投影し、
  透明Canvasへ「青だけ」をもう一度描きます。
  白い縁・影・別形状は追加しないので、見た目は白道の選択区間だけが
  そのまま青へ変わった状態になります。
*/
let activeRouteTopCanvas = null;
let activeRouteTopContext = null;

function activeRouteWidthAtZoom(zoom) {
  const stops = [
    [12, 10.0],
    [14, 11.5],
    [16, 13.5],
    [18, 16.5],
    [18.25, 19.5],
    [20, 23.5]
  ];
  if (zoom <= stops[0][0]) return stops[0][1];
  if (zoom >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [z0, w0] = stops[i];
    const [z1, w1] = stops[i + 1];
    if (zoom >= z0 && zoom <= z1) {
      const t = (zoom - z0) / (z1 - z0);
      return w0 + (w1 - w0) * t;
    }
  }
  return 6.8;
}

function ensureActiveRouteTopCanvas() {
  if (!state.map) return null;
  const container = state.map.getContainer();
  if (!container) return null;

  if (!activeRouteTopCanvas || !activeRouteTopCanvas.isConnected) {
    activeRouteTopCanvas = document.createElement("canvas");
    activeRouteTopCanvas.className = "active-route-top-canvas";
    activeRouteTopCanvas.setAttribute("aria-hidden", "true");
    container.appendChild(activeRouteTopCanvas);
    activeRouteTopContext = activeRouteTopCanvas.getContext("2d");
  }

  const rect = container.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
  const pixelHeight = Math.max(1, Math.round(rect.height * dpr));

  if (activeRouteTopCanvas.width !== pixelWidth || activeRouteTopCanvas.height !== pixelHeight) {
    activeRouteTopCanvas.width = pixelWidth;
    activeRouteTopCanvas.height = pixelHeight;
    activeRouteTopCanvas.style.width = `${rect.width}px`;
    activeRouteTopCanvas.style.height = `${rect.height}px`;
  }

  activeRouteTopContext?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return activeRouteTopContext;
}

function clearActiveRouteTopCanvas() {
  if (!activeRouteTopCanvas || !activeRouteTopContext) return;
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  activeRouteTopContext.save();
  activeRouteTopContext.setTransform(1, 0, 0, 1, 0, 0);
  activeRouteTopContext.clearRect(0, 0, activeRouteTopCanvas.width, activeRouteTopCanvas.height);
  activeRouteTopContext.restore();
  activeRouteTopContext.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function renderActiveRouteTopCanvas() {
  /*
    v23: 画面最前面Canvasで青線を二重描画しない。
    青ルートはMapLibre内で「道路より上・建物より下」に置くことで、
    建物・写真・名称の上を横切らない自然な重なりにする。
  */
  clearActiveRouteTopCanvas();
}

function routeGlowOpacityAtZoom(zoom) {
  const reveal = getPhotoRevealZoom();
  if (!Number.isFinite(zoom) || zoom >= reveal) return 0;
  if (zoom <= 15.2) return 0.82;
  if (zoom <= 16.5) return 0.74;
  if (zoom <= 17.5) return 0.62;
  const t = Math.max(0, Math.min(1, (reveal - zoom) / Math.max(0.01, reveal - 17.5)));
  return 0.58 * t;
}


/*
  v31: 遠景の青ルートをさらに見つけやすくする「上空ライト」。
  ルートの地理座標を画面へ投影し、道路線より少し上へ持ち上げた位置に
  淡い光の帯と移動する光点を描く。写真が表示される近距離では完全に消す。
*/
function ensureRouteAirGlowCanvas() {
  if (!state.map) return null;
  const container = state.map.getContainer();
  if (!container) return null;

  if (!state.routeAirGlowCanvas || !state.routeAirGlowCanvas.isConnected) {
    const canvas = document.createElement("canvas");
    canvas.className = "route-air-glow-canvas";
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);
    state.routeAirGlowCanvas = canvas;
    state.routeAirGlowContext = canvas.getContext("2d");
  }

  const rect = container.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
  const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
  const canvas = state.routeAirGlowCanvas;
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }
  state.routeAirGlowContext?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return state.routeAirGlowContext;
}

function clearRouteAirGlowCanvas() {
  const canvas = state.routeAirGlowCanvas;
  const context = state.routeAirGlowContext;
  if (!canvas || !context) return;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.restore();
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function routeCoordinateAtFraction(coordinates, fraction) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return coordinates?.[0] || null;
  const lengths = [];
  let total = 0;
  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const a = coordinates[i];
    const b = coordinates[i + 1];
    const length = metresBetween({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] });
    const safeLength = Number.isFinite(length) ? Math.max(0, length) : 0;
    lengths.push(safeLength);
    total += safeLength;
  }
  if (total <= 0) return coordinates[0];
  let target = Math.max(0, Math.min(1, fraction)) * total;
  for (let i = 0; i < lengths.length; i += 1) {
    const segment = lengths[i];
    if (target <= segment || i === lengths.length - 1) {
      const a = coordinates[i];
      const b = coordinates[i + 1];
      const t = segment > 0 ? Math.max(0, Math.min(1, target / segment)) : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    target -= segment;
  }
  return coordinates[coordinates.length - 1];
}

function routeAirLiftAtZoom(zoom, fraction = 0.5) {
  /* 遠景ほど高く浮かせ、近づくほど道路へ寄せる。 */
  const reveal = getPhotoRevealZoom();
  const far = Math.max(0, Math.min(1, (reveal - zoom) / 3.0));
  return 16 + far * 35 + Math.sin(Math.PI * fraction) * (5 + far * 7);
}

function renderRouteAirGlow(now = performance.now()) {
  const context = ensureRouteAirGlowCanvas();
  clearRouteAirGlowCanvas();
  if (!context || !state.map || !state.activeRoute) return;

  const zoom = state.map.getZoom();
  const opacity = routeGlowOpacityAtZoom(zoom);
  if (opacity <= 0) return;
  const coordinates = state.activeRoute.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return;

  const reducedMotion = document.body.classList.contains("ud-reduced-motion")
    || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const sampleCount = 34;
  const liftedPoints = [];
  const groundPoints = [];

  for (let index = 0; index <= sampleCount; index += 1) {
    const fraction = index / sampleCount;
    const coordinate = routeCoordinateAtFraction(coordinates, fraction);
    if (!coordinate) continue;
    const projected = state.map.project(coordinate);
    if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) continue;
    const lift = routeAirLiftAtZoom(zoom, fraction);
    groundPoints.push({ x: projected.x, y: projected.y, fraction });
    liftedPoints.push({ x: projected.x, y: projected.y - lift, fraction });
  }
  if (liftedPoints.length < 2) return;

  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  context.lineJoin = "round";

  /* 道路から上空へ伸びるごく淡い光柱。上空にあることを分かりやすくする。 */
  context.lineWidth = 1.2;
  context.strokeStyle = `rgba(126, 211, 255, ${0.16 * opacity})`;
  for (let index = 3; index < liftedPoints.length - 2; index += 6) {
    const upper = liftedPoints[index];
    const lower = groundPoints[index];
    if (!upper || !lower) continue;
    context.beginPath();
    context.moveTo(lower.x, lower.y - 3);
    context.lineTo(upper.x, upper.y);
    context.stroke();
  }

  /* 上空の光の帯。点線がルート方向へ流れる。 */
  context.beginPath();
  liftedPoints.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.lineWidth = Math.max(2.2, 4.8 - Math.max(0, zoom - 15) * 0.45);
  context.strokeStyle = `rgba(137, 222, 255, ${0.56 * opacity})`;
  context.shadowColor = "rgba(77, 190, 255, .95)";
  context.shadowBlur = 14;
  context.setLineDash([2.5, 13]);
  context.lineDashOffset = reducedMotion ? 0 : -(now / 55) % 15.5;
  context.stroke();
  context.setLineDash([]);

  /*
    v33: 近未来ナビ風のホログラムルート。
    丸い光点は使わず、ルート進行方向へ流れるネオンコア・外側の発光・
    細いスキャンライン・短い方向アクセントを重ねる。
  */
  const holoCount = reducedMotion ? 2 : 5;
  for (let holo = 0; holo < holoCount; holo += 1) {
    const phase = reducedMotion
      ? (holo + 1) / (holoCount + 1)
      : ((now / 5200) + holo / holoCount) % 1;

    const coordinate = routeCoordinateAtFraction(coordinates, phase);
    const prevCoordinate = routeCoordinateAtFraction(coordinates, Math.max(0, phase - 0.022));
    const nextCoordinate = routeCoordinateAtFraction(coordinates, Math.min(1, phase + 0.022));
    if (!coordinate || !prevCoordinate || !nextCoordinate) continue;

    const projected = state.map.project(coordinate);
    const prevProjected = state.map.project(prevCoordinate);
    const nextProjected = state.map.project(nextCoordinate);
    const lift = routeAirLiftAtZoom(zoom, phase);
    const x = projected.x;
    const y = projected.y - lift;
    const px = prevProjected.x;
    const py = prevProjected.y - routeAirLiftAtZoom(zoom, Math.max(0, phase - 0.022));
    const nx = nextProjected.x;
    const ny = nextProjected.y - routeAirLiftAtZoom(zoom, Math.min(1, phase + 0.022));
    const angle = Math.atan2(ny - py, nx - px);
    const length = Math.max(34, 66 - Math.max(0, zoom - 15) * 6.0);
    const width = Math.max(5.5, 11.5 - Math.max(0, zoom - 15) * 1.1);

    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.globalCompositeOperation = 'lighter';

    /* 外側のホログラムグロー */
    context.strokeStyle = `rgba(65, 185, 255, ${0.22 * opacity})`;
    context.lineWidth = width * 2.8;
    context.shadowColor = `rgba(65, 185, 255, ${0.95 * opacity})`;
    context.shadowBlur = 24;
    context.beginPath();
    context.moveTo(-length * 0.76, 0);
    context.lineTo(length * 0.62, 0);
    context.stroke();

    /* ネオンの中心線 */
    const coreGradient = context.createLinearGradient(-length * 0.78, 0, length * 0.64, 0);
    coreGradient.addColorStop(0, 'rgba(120,220,255,0)');
    coreGradient.addColorStop(0.18, `rgba(120,220,255, ${0.28 * opacity})`);
    coreGradient.addColorStop(0.52, `rgba(145,232,255, ${0.72 * opacity})`);
    coreGradient.addColorStop(0.82, `rgba(255,255,255, ${0.98 * opacity})`);
    coreGradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.strokeStyle = coreGradient;
    context.lineWidth = Math.max(1.8, width * 0.42);
    context.shadowBlur = 12;
    context.beginPath();
    context.moveTo(-length * 0.78, 0);
    context.lineTo(length * 0.64, 0);
    context.stroke();

    /* 進行方向を示す短い光フィン */
    context.strokeStyle = `rgba(210, 246, 255, ${0.76 * opacity})`;
    context.lineWidth = 1.3;
    context.shadowBlur = 8;
    const finX = length * 0.28;
    context.beginPath();
    context.moveTo(finX - 5, -width * 0.72);
    context.lineTo(finX + 5, 0);
    context.lineTo(finX - 5, width * 0.72);
    context.stroke();

    /* スキャンライン。流れて見えるが丸にはしない。 */
    const scan = reducedMotion ? 0.5 : ((now / 900 + holo * 0.21) % 1);
    const scanX = -length * 0.58 + scan * length * 1.08;
    const scanGradient = context.createLinearGradient(scanX - 7, 0, scanX + 7, 0);
    scanGradient.addColorStop(0, 'rgba(255,255,255,0)');
    scanGradient.addColorStop(0.5, `rgba(255,255,255, ${0.95 * opacity})`);
    scanGradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.strokeStyle = scanGradient;
    context.lineWidth = width * 0.7;
    context.shadowColor = `rgba(157, 235, 255, ${0.95 * opacity})`;
    context.shadowBlur = 16;
    context.beginPath();
    context.moveTo(scanX - 6, 0);
    context.lineTo(scanX + 6, 0);
    context.stroke();

    context.restore();
  }

  context.restore();
}

function stopRouteGlowAnimation() {
  if (state.routeGlowAnimationFrame !== null) {
    cancelAnimationFrame(state.routeGlowAnimationFrame);
    state.routeGlowAnimationFrame = null;
  }
  if (state.map?.getLayer("active-blue-route-glow")) {
    try { state.map.setPaintProperty("active-blue-route-glow", "line-opacity", 0); } catch {}
  }
  clearRouteAirGlowCanvas();
}

function startRouteGlowAnimation() {
  if (!state.map || !state.activeRoute || state.routeGlowAnimationFrame !== null) return;
  const tick = (now) => {
    if (!state.map || !state.activeRoute || !state.map.getLayer("active-blue-route-glow")) {
      state.routeGlowAnimationFrame = null;
      return;
    }
    const base = routeGlowOpacityAtZoom(state.map.getZoom());
    const pulse = 0.72 + 0.28 * ((Math.sin(now / 430) + 1) / 2);
    try {
      state.map.setPaintProperty("active-blue-route-glow", "line-opacity", base * pulse);
    } catch {}
    renderRouteAirGlow(now);
    state.map.triggerRepaint?.();
    state.routeGlowAnimationFrame = requestAnimationFrame(tick);
  };
  state.routeGlowAnimationFrame = requestAnimationFrame(tick);
}

function refreshActiveRouteTopLayer() {
  ensureActiveRouteOnTop();
  renderActiveRouteTopCanvas();
  updateRouteBuildingReadability();
  if (state.activeRoute) {
    renderRouteAirGlow(performance.now());
    startRouteGlowAnimation();
  }
  else stopRouteGlowAnimation();
}

function addHighlightedBuildings() {
  /*
    v12: 7酒蔵 + くぐり門を複数棟で構成。
    白壁、木腰、瓦の軒・屋根・棟、店先、煙突を別レイヤーにし、俯瞰でも「蔵」に見えるようにします。
    ルートレイヤーは変更しません。
  */
  const buildingPlaces = PLACES.filter((place) =>
    place.type === "brewery"
    || place.type === "gate"
    || FEATURED_LANDMARK_IDS.has(place.id)
  );
  const groups = { bodies: [], timber: [], eaves: [], roofs: [], ridges: [], details: [] };

  buildingPlaces.forEach((place) => {
    const model = buildBreweryModel(place);
    Object.keys(groups).forEach((key) => groups[key].push(...model[key]));
  });

  const fc = (features) => ({ type: "FeatureCollection", features });
  state.map.addSource("featured-buildings", { type: "geojson", data: fc(groups.bodies) });
  state.map.addSource("featured-building-timber", { type: "geojson", data: fc(groups.timber) });
  state.map.addSource("featured-roof-eaves", { type: "geojson", data: fc(groups.eaves) });
  state.map.addSource("featured-roofs", { type: "geojson", data: fc(groups.roofs) });
  state.map.addSource("featured-roof-ridges", { type: "geojson", data: fc(groups.ridges) });
  state.map.addSource("featured-building-details", { type: "geojson", data: fc(groups.details) });

  state.map.addLayer({
    id: "featured-building-shadow",
    type: "fill-extrusion",
    source: "featured-buildings",
    paint: {
      "fill-extrusion-color": "#202729",
      "fill-extrusion-height": ["+", ["get", "height"], 1.25],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0,
      "fill-extrusion-translate": [4, 7]
    }
  });

  state.map.addLayer({
    id: "featured-building-body",
    type: "fill-extrusion",
    source: "featured-buildings",
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-opacity": 1,
      "fill-extrusion-vertical-gradient": true
    }
  });

  state.map.addLayer({
    id: "featured-building-timber",
    type: "fill-extrusion",
    source: "featured-building-timber",
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-opacity": 1,
      "fill-extrusion-vertical-gradient": true
    }
  });

  state.map.addLayer({
    id: "featured-building-roof-eave",
    type: "fill-extrusion",
    source: "featured-roof-eaves",
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-opacity": 1,
      "fill-extrusion-vertical-gradient": true
    }
  });

  state.map.addLayer({
    id: "featured-building-roof",
    type: "fill-extrusion",
    source: "featured-roofs",
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-opacity": 1,
      "fill-extrusion-vertical-gradient": true
    }
  });

  state.map.addLayer({
    id: "featured-building-roof-ridge",
    type: "fill-extrusion",
    source: "featured-roof-ridges",
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-opacity": 1
    }
  });

  state.map.addLayer({
    id: "featured-building-detail",
    type: "fill-extrusion",
    source: "featured-building-details",
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-opacity": 1,
      "fill-extrusion-vertical-gradient": true
    }
  });

  state.map.addLayer({
    id: "featured-building-outline",
    type: "line",
    source: "featured-buildings",
    paint: {
      "line-color": ["case", ["==", ["get", "placeType"], "gate"], "#5a3c29", "#687276"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 15, 0.8, 18, 1.5, 20, 2.0],
      "line-opacity": 1
    }
  });
}


/*
  v13: 遠景では酒蔵を透明にしません。
  青ルート表示中でも、地図を遠くから見ている間は建物を通常の濃さで表示し、
  近距離の俯瞰で建物と青ルートが重なる場合だけ、建物を少し透過します。
  青ルートの太さ・色・経路・Canvas最前面描画は変更しません。
*/
const ROUTE_BUILDING_OPACITY = {
  /* v19: 壁・木部・軒・屋根・棟・煙突など全建物面を opacity 1（100%不透明）で固定。半透明の人工影は使わない。 */
  normal: { shadow: 0, body: 1, timber: 1, eave: 1, roof: 1, ridge: 1, detail: 1, outline: 1 }
};
let routeBuildingFadeApplied = false;

function updateRouteBuildingReadability(force = false) {
  /* v19: 距離・ズーム・青ルートの有無に関係なく、実建物パーツの透明度は変えない。 */
  if (!state.map) return;
  const values = ROUTE_BUILDING_OPACITY.normal;
  const layerValues = [
    ["featured-building-shadow", "fill-extrusion-opacity", values.shadow],
    ["featured-building-body", "fill-extrusion-opacity", values.body],
    ["featured-building-timber", "fill-extrusion-opacity", values.timber],
    ["featured-building-roof-eave", "fill-extrusion-opacity", values.eave],
    ["featured-building-roof", "fill-extrusion-opacity", values.roof],
    ["featured-building-roof-ridge", "fill-extrusion-opacity", values.ridge],
    ["featured-building-detail", "fill-extrusion-opacity", values.detail],
    ["featured-building-outline", "line-opacity", values.outline]
  ];
  layerValues.forEach(([id, property, value]) => {
    if (!state.map.getLayer(id)) return;
    try { state.map.setPaintProperty(id, property, value); } catch (error) {
      console.debug("Building opacity update skipped:", id, error);
    }
  });
  routeBuildingFadeApplied = false;
}

function mapDisplayName(place) {
  return place.mapName || place.name;
}

function featuredMarkerBadgeClass(place) {
  if (place.type === "station") return "station";
  if (place.id === "yume-town") return "shopping";
  return "culture";
}

function createPlaceMarker(place) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `place-marker ${place.type}${place.image ? " has-picture" : ""} place-${place.id}${FEATURED_LANDMARK_IDS.has(place.id) ? " featured-landmark" : ""}`;
  button.setAttribute("aria-label", `${mapDisplayName(place)}の詳細を開く`);

  const isFeaturedLandmark = FEATURED_LANDMARK_IDS.has(place.id);

  if (isFeaturedLandmark && place.image) {
    const mapName = mapDisplayName(place);
    const badgeClass = featuredMarkerBadgeClass(place);
    const overviewBuilding = `
      <span class="overview-building-label-marker landmark-label ${badgeClass}" aria-hidden="true">
        <span class="overview-building-name-badge">${place.number}</span>
        <span class="overview-building-name-box">${mapName}</span>
      </span>`;

    if (place.id === "saijo-station") {
      button.innerHTML = `
        ${overviewBuilding}
        <span class="station-dual-picture photo-marker-part" aria-hidden="true">
          <span class="dual-photo-card station-photo-card">
            <img src="${place.thumb || place.image}" alt="" loading="lazy" decoding="async" width="420" height="280">
            <b>JR西条駅</b>
          </span>
          <span class="dual-photo-card tourist-info-photo-card">
            <img src="${place.secondImage}" data-fallback="${place.secondImageFallback || place.image}" alt="" loading="lazy" decoding="async" width="420" height="280">
            <b>${place.secondImageLabel || "東広島市観光案内所"}</b>
          </span>
        </span>
        <span class="station-picture-label station-combined-label photo-marker-part">${mapName}</span>
        <span class="station-picture-pin photo-marker-part" aria-hidden="true">${place.number}</span>
      `;
      const secondImage = button.querySelector(".tourist-info-photo-card img");
      secondImage?.addEventListener("error", () => {
        const fallback = secondImage.dataset.fallback;
        if (fallback && secondImage.src !== fallback) secondImage.src = fallback;
      }, { once: true });
    } else {
      button.innerHTML = `
        ${overviewBuilding}
        <span class="station-picture landmark-picture photo-marker-part" aria-hidden="true">
          <img src="${place.thumb || place.image}" alt="" loading="lazy" decoding="async" width="420" height="280">
        </span>
        <span class="station-picture-label landmark-picture-label photo-marker-part">${mapName}</span>
        <span class="station-picture-pin landmark-picture-pin ${badgeClass} photo-marker-part" aria-hidden="true">${place.number}</span>
      `;
    }
  } else if (place.type === "spot") {
    button.innerHTML = `
      <span class="nearby-spot-label">${place.name}</span>
      <span class="nearby-spot-pin ${place.category || ""}" aria-hidden="true">${place.number}</span>
    `;
  } else if (place.image) {
    const overviewBuilding = place.type === "brewery"
      ? `
        <span class="overview-building-label-marker brewery-label" aria-hidden="true">
          <span class="overview-building-name-badge">${place.number}</span>
          <span class="overview-building-name-box">${place.name}</span>
        </span>`
      : `
        <span class="overview-building-label-marker ${place.type === "gate" ? "gate-label" : "station-label"}" aria-hidden="true">
          <span class="overview-building-name-badge">${place.number}</span>
          <span class="overview-building-name-box">${place.name}</span>
        </span>`;
    button.innerHTML = `
      ${overviewBuilding}
      <span class="station-picture photo-marker-part" aria-hidden="true">
        <img src="${place.thumb || place.image}" alt="" loading="lazy" decoding="async" width="420" height="280">
      </span>
      <span class="station-picture-label photo-marker-part">${mapDisplayName(place)}</span>
      <span class="station-picture-pin photo-marker-part" aria-hidden="true">${place.number}</span>
    `;
  } else {
    button.innerHTML = `
      <span class="marker-label">${place.name}</span>
      <span class="marker-pin" aria-hidden="true">${place.number}</span>
    `;
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    selectPlace(place);
  });

  return button;
}

function getPhotoRevealZoom() {
  return window.matchMedia("(max-width: 640px)").matches
    ? PHOTO_REVEAL_ZOOM_MOBILE
    : PHOTO_REVEAL_ZOOM_DESKTOP;
}

function updatePlaceMarkerMode() {
  if (!state.map) return;

  const mapElement = state.map.getContainer();
  const zoom = state.map.getZoom();
  const photoMode = zoom >= getPhotoRevealZoom();
  const overviewScale = Math.max(0.76, Math.min(1, 0.76 + (zoom - 16.3) * 0.18));
  const scaleText = overviewScale.toFixed(3);

  // DOMのクラスとCSS変数は、値が変わったときだけ更新します。
  if (state.markerPhotoMode !== photoMode) {
    state.markerPhotoMode = photoMode;
    mapElement.classList.toggle("photo-marker-mode", photoMode);
    mapElement.classList.toggle("overview-marker-mode", !photoMode);
  }
  if (state.markerScale !== scaleText) {
    state.markerScale = scaleText;
    mapElement.style.setProperty("--overview-marker-scale", scaleText);
  }
}

function addPlaceMarkers() {
  state.markers.forEach((marker) => marker.remove());
  state.markers.clear();

  PLACES.forEach((place) => {
    if (place.mapMarkerHidden) return;

    const marker = new maplibregl.Marker({
      element: createPlaceMarker(place),
      anchor: "bottom",
      pitchAlignment: "viewport",
      rotationAlignment: "viewport"
    })
      .setLngLat(
        (place.type === "brewery" || place.type === "gate" || FEATURED_LANDMARK_IDS.has(place.id))
          ? visualPlaceLngLat(place)
          : [place.lng, place.lat]
      )
      .addTo(state.map);

    state.markers.set(place.id, marker);
  });
}

function isUserPointVisible() {
  if (!state.ready || !state.map || !state.userPosition) return false;

  const container = state.map.getContainer();
  const point = state.map.project([state.userPosition.lng, state.userPosition.lat]);
  const horizontalMargin = 46;
  const topMargin = 54;
  const bottomMargin = 96;

  return point.x >= -horizontalMargin
    && point.x <= container.clientWidth + horizontalMargin
    && point.y >= -topMargin
    && point.y <= container.clientHeight - bottomMargin;
}

function updateUserPeek() {
  const peek = $("userPeek");
  if (!peek) return;

  const waitingForGps = !state.userPosition;
  const outsideArea = state.userPosition
    ? metresBetween(state.userPosition, SAIJO_CENTER) > AREA_RADIUS_METERS
    : false;
  const userOffScreen = state.userPosition ? !isUserPointVisible() : true;
  const shouldShow = waitingForGps || outsideArea || userOffScreen;
  const isHidden = (state.isZooming || state.isAvatarReturning || state.avatarWaitingForOpeningView) && shouldShow;
  const signature = `${shouldShow}|${waitingForGps}|${outsideArea}|${isHidden}`;
  if (signature === state.lastPeekSignature) return;
  state.lastPeekSignature = signature;

  peek.classList.toggle("visible", shouldShow);
  peek.classList.toggle("waiting", waitingForGps);
  peek.classList.toggle("outside-area", outsideArea);
  peek.classList.toggle("zooming", isHidden);
}

function syncAvatarTransparency() {
  const shouldHide = state.isZooming
    || state.isAvatarReturning
    || state.avatarWaitingForOpeningView
    || state.avatarHiddenByMapInteraction;
  if (state.lastAvatarHidden === shouldHide) return;
  state.lastAvatarHidden = shouldHide;

  $("userPeek")?.classList.toggle("zooming", shouldHide);
  state.userMarker?.getElement()?.classList.toggle("map-zooming", shouldHide);
}

function captureInitialMapView(lockView = false) {
  if (!state.map) return;
  const center = state.map.getCenter();
  state.initialMapView = {
    center: [center.lng, center.lat],
    zoom: state.map.getZoom(),
    pitch: state.map.getPitch(),
    bearing: state.map.getBearing()
  };
  if (lockView) state.initialViewLocked = true;
}

function finishAvatarReturn() {
  window.clearTimeout(state.avatarReturnTimer);
  state.avatarReturnTimer = null;
  state.isProgrammaticCamera = false;
  state.isAvatarReturning = false;
  syncAvatarTransparency();
  updateUserPeek();
  updateAvatarFacing();
}

function initialViewReached() {
  if (!state.map || !state.initialMapView) return true;
  const center = state.map.getCenter();
  const target = state.initialMapView;
  return Math.abs(state.map.getZoom() - target.zoom) < 0.04
    && Math.abs(center.lng - target.center[0]) < 0.000025
    && Math.abs(center.lat - target.center[1]) < 0.000025
    && Math.abs(state.map.getPitch() - target.pitch) < 0.4
    && Math.abs(state.map.getBearing() - target.bearing) < 0.4;
}

function avatarIsAtFixedScreenPosition() {
  /*
    自キャラが「画面下中央の定位置」に戻っているかを画面座標で確認します。
    ズーム終了だけでは再表示せず、地図の初期表示とこの定位置の両方が
    そろったときだけ男の子を表示します。
  */
  if (!state.map || !state.userMarker) return !state.userPosition;

  const markerLngLat = state.userMarker.getLngLat();
  const point = state.map.project(markerLngLat);
  const container = state.map.getContainer();
  const targetX = container.clientWidth / 2;
  const targetY = container.clientHeight / 2 + userBottomCenterOffset();

  return Math.abs(point.x - targetX) <= 30
    && Math.abs(point.y - targetY) <= 34;
}

function holdAvatarUntilOpeningView() {
  if (!state.map) return;
  if (!state.initialMapView) captureInitialMapView(true);

  state.avatarWaitingForOpeningView = true;
  state.avatarHiddenByMapInteraction = true;
  state.followUser = false;
  $("locationButton")?.classList.remove("primary");
  syncAvatarTransparency();
  updateUserPeek();
}

function releaseAvatarAtOpeningView() {
  if (!state.avatarWaitingForOpeningView) return false;
  if (!initialViewReached()) return false;
  if (!avatarIsAtFixedScreenPosition()) return false;

  state.avatarWaitingForOpeningView = false;
  state.avatarHiddenByMapInteraction = false;
  state.isZooming = false;

  syncAvatarTransparency();
  updateUserPeek();
  updateAvatarFacing();
  setStatus("地図を初期表示に戻しました。");
  return true;
}

function returnToOpeningView(duration = 720) {
  if (!state.map || !state.initialMapView) {
    showOverview(duration);
    return;
  }

  holdAvatarUntilOpeningView();
  state.isProgrammaticCamera = true;
  const reducedMotion = prefersReducedMotion();

  state.map.once("moveend", () => {
    state.isProgrammaticCamera = false;
    requestAnimationFrame(() => {
      if (!releaseAvatarAtOpeningView()) {
        syncAvatarTransparency();
        setStatus("地図を初期表示に戻しました。");
      }
    });
  });

  state.map.easeTo({
    center: state.initialMapView.center,
    zoom: state.initialMapView.zoom,
    pitch: state.initialMapView.pitch,
    bearing: state.initialMapView.bearing,
    duration: reducedMotion ? 0 : duration,
    easing: (t) => 1 - Math.pow(1 - t, 3),
    essential: true
  });

  setStatus("最初に開いた地図位置へ戻っています");
}

function returnMapToInitialView() {
  window.clearTimeout(state.avatarReturnTimer);

  if (!state.map || !state.initialMapView) {
    finishAvatarReturn();
    return;
  }

  state.isAvatarReturning = true;
  state.isProgrammaticCamera = true;
  syncAvatarTransparency();

  const reducedMotion = prefersReducedMotion();
  let finished = false;
  const finishOnce = () => {
    if (finished || !initialViewReached()) return;
    finished = true;
    finishAvatarReturn();
    setStatus("最初の位置に戻りました。探索を続けられます");
  };

  state.map.once("moveend", finishOnce);
  state.map.easeTo({
    center: state.initialMapView.center,
    zoom: state.initialMapView.zoom,
    pitch: state.initialMapView.pitch,
    bearing: state.initialMapView.bearing,
    duration: reducedMotion ? 0 : 760,
    easing: (t) => 1 - Math.pow(1 - t, 3),
    essential: true
  });

  /* moveendが発生しなかった場合でも、初期位置へ合わせてから再表示します。 */
  state.avatarReturnTimer = window.setTimeout(() => {
    if (!initialViewReached()) {
      state.map.jumpTo({
        center: state.initialMapView.center,
        zoom: state.initialMapView.zoom,
        pitch: state.initialMapView.pitch,
        bearing: state.initialMapView.bearing
      });
    }
    finishOnce();
  }, reducedMotion ? 120 : 1450);
}

function setAvatarZoomFade(isZooming) {
  state.isZooming = isZooming;

  /*
    一度でも利用者がズームしたら、男の子はその場で停止して完全透明になります。
    地図は勝手に戻しません。ズーム終了だけでは再表示せず、利用者が「全体」
    ボタンを押すか手動で、最初の中心・倍率・角度と画面下中央の定位置へ
    戻したときだけ再表示します。
  */
  if (isZooming) {
    holdAvatarUntilOpeningView();
    setStatus("地図を拡大・縮小しています。");
    return;
  }

  /*
    ズーム終了だけでは男の子を再表示しません。
    初期表示と画面下中央の定位置へ戻ったことは moveend 側で厳密に確認します。
  */
  syncAvatarTransparency();
  updateUserPeek();
  setStatus("地図の拡大・縮小を終了しました。");
}

function setTravelMapInteractionLock(locked) {
  const map = state.map;
  if (!map || state.travelMapInteractionLocked === locked) return;

  state.travelMapInteractionLocked = locked;
  const actions = locked ? "disable" : "enable";

  [
    map.dragPan,
    map.scrollZoom,
    map.boxZoom,
    map.doubleClickZoom,
    map.keyboard,
    map.touchZoomRotate
  ].forEach((handler) => {
    try { handler?.[actions]?.(); } catch (error) {}
  });

  /* 北が上のままになるよう、復帰後も回転操作だけは無効にします。 */
  if (!locked) {
    try { map.touchZoomRotate.disableRotation(); } catch (error) {}
  }
}

function formatTravelDistance(distanceMetres) {
  const kilometres = distanceMetres / 1000;
  if (kilometres < 10) return `${kilometres.toFixed(1)}キロメートル`;
  if (kilometres < 100) return `${Math.round(kilometres)}キロメートル`;
  return `約${Math.round(kilometres / 10) * 10}キロメートル`;
}

function travelModeForDistance(distanceMetres) {
  if (distanceMetres >= 800000) return "plane";
  if (distanceMetres > 15000) return "train";
  return "car";
}

function railLayerIds() {
  const layers = state.map?.getStyle()?.layers || [];
  return layers
    .filter((layer) => {
      if (layer.type !== "line") return false;
      const key = `${layer.id || ""} ${layer["source-layer"] || ""}`.toLowerCase();
      return /rail|railway/.test(key);
    })
    .map((layer) => layer.id);
}

function setActualRailwayHighlight(active) {
  const width = active
    ? ["interpolate", ["linear"], ["zoom"], 12, 3.6, 15, 5.7, 17, 8.2, 19, 10.5]
    : ["interpolate", ["linear"], ["zoom"], 12, 2.2, 15, 3.8, 17, 5.4, 19, 7.2];

  railLayerIds().forEach((id) => {
    try {
      state.map.setPaintProperty(id, "line-color", active ? "#202d35" : "#3f4b55");
      state.map.setPaintProperty(id, "line-opacity", active ? 1 : 0.88);
      state.map.setPaintProperty(id, "line-width", width);
    } catch (error) {
      console.debug("Railway highlight skipped:", id, error);
    }
  });
}

function emptyTravelRoute() {
  state.map?.getSource("travel-map-route")?.setData({
    type: "FeatureCollection",
    features: []
  });
  state.map?.getSource("travel-map-flight-route")?.setData({
    type: "FeatureCollection",
    features: []
  });

  [
    "travel-map-route-casing",
    "travel-map-route-main",
    "travel-map-rail-bed",
    "travel-map-rail-left",
    "travel-map-rail-right",
    "travel-map-flight-shadow",
    "travel-map-flight-main"
  ].forEach((id) => {
    if (state.map?.getLayer(id)) state.map.setPaintProperty(id, "line-opacity", 0);
  });
  if (state.map?.getLayer("travel-map-rail-sleepers")) {
    state.map.setPaintProperty("travel-map-rail-sleepers", "text-opacity", 0);
  }
  setActualRailwayHighlight(false);
}

function setTravelRoute(coordinates, mode) {
  const routeSource = state.map?.getSource("travel-map-route");
  const flightSource = state.map?.getSource("travel-map-flight-route");
  if (!routeSource || !flightSource) return;

  const featureCollection = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { mode },
      geometry: { type: "LineString", coordinates }
    }]
  };

  const isCar = mode === "car";
  const isTrain = mode === "train";
  const isPlane = mode === "plane";

  routeSource.setData(isPlane ? { type: "FeatureCollection", features: [] } : featureCollection);
  flightSource.setData(isPlane ? featureCollection : { type: "FeatureCollection", features: [] });

  state.map.setPaintProperty("travel-map-route-casing", "line-opacity", isCar ? 0.82 : 0);
  state.map.setPaintProperty("travel-map-route-main", "line-opacity", isCar ? 1 : 0);

  /* 電車用に別の線路を描かず、OSMの実際の線路だけを強調します。 */
  state.map.setPaintProperty("travel-map-rail-bed", "line-opacity", 0);
  state.map.setPaintProperty("travel-map-rail-left", "line-opacity", 0);
  state.map.setPaintProperty("travel-map-rail-right", "line-opacity", 0);
  state.map.setPaintProperty("travel-map-rail-sleepers", "text-opacity", 0);
  setActualRailwayHighlight(isTrain);

  state.map.setPaintProperty("travel-map-flight-shadow", "line-opacity", isPlane ? 0.42 : 0);
  state.map.setPaintProperty("travel-map-flight-main", "line-opacity", isPlane ? 0.94 : 0);
}

function lineCoordinateArrays(feature) {
  if (!feature?.geometry) return [];
  if (feature.geometry.type === "LineString") return [feature.geometry.coordinates];
  if (feature.geometry.type === "MultiLineString") return feature.geometry.coordinates;
  return [];
}

function pointSegmentDistanceMetres(point, a, b) {
  const latScale = 110540;
  const lngScale = 111320 * Math.cos(point[1] * Math.PI / 180);
  const ax = (a[0] - point[0]) * lngScale;
  const ay = (a[1] - point[1]) * latScale;
  const bx = (b[0] - point[0]) * lngScale;
  const by = (b[1] - point[1]) * latScale;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
  const px = ax + dx * t;
  const py = ay + dy * t;
  return {
    distance: Math.hypot(px, py),
    t,
    coordinate: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  };
}

function closestPointOnPolyline(coordinates, point) {
  let best = { distance: Infinity, segmentIndex: 0, t: 0, coordinate: coordinates[0] };
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const result = pointSegmentDistanceMetres(point, coordinates[index], coordinates[index + 1]);
    if (result.distance < best.distance) {
      best = { ...result, segmentIndex: index };
    }
  }
  return best;
}

function polylineLengthMetres(coordinates) {
  return routeMetrics(coordinates).total;
}

function collectActualRailwayCandidates() {
  const map = state.map;
  if (!map) return [];
  const style = map.getStyle();
  const layers = style?.layers || [];
  const railLayers = layers.filter((layer) => {
    if (layer.type !== "line") return false;
    const key = `${layer.id || ""} ${layer["source-layer"] || ""}`.toLowerCase();
    return /rail|railway/.test(key);
  });

  const features = [];
  try {
    const ids = railLayers.map((layer) => layer.id);
    if (ids.length) features.push(...map.queryRenderedFeatures(undefined, { layers: ids }));
  } catch (error) {
    console.debug("Rendered railway lookup failed:", error);
  }

  railLayers.forEach((layer) => {
    if (!layer.source || !layer["source-layer"]) return;
    try {
      features.push(...map.querySourceFeatures(layer.source, { sourceLayer: layer["source-layer"] }));
    } catch (error) {}
  });

  const seen = new Set();
  const candidates = [];
  features.forEach((feature) => {
    lineCoordinateArrays(feature).forEach((coordinates) => {
      if (!Array.isArray(coordinates) || coordinates.length < 2) return;
      const first = coordinates[0];
      const last = coordinates.at(-1);
      const key = `${first[0].toFixed(6)},${first[1].toFixed(6)}:${last[0].toFixed(6)},${last[1].toFixed(6)}:${coordinates.length}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(coordinates);
    });
  });
  return candidates;
}

function actualRailwayRouteToSaijoStation() {
  const station = [SAIJO_STATION.lng, SAIJO_STATION.lat];
  const candidates = collectActualRailwayCandidates();
  let best = null;

  candidates.forEach((coordinates) => {
    const closest = closestPointOnPolyline(coordinates, station);
    const total = polylineLengthMetres(coordinates);
    if (closest.distance > 180 || total < 80) return;
    const score = closest.distance + Math.max(0, 420 - total) * 0.22;
    if (!best || score < best.score) best = { coordinates, closest, total, score };
  });

  if (!best) return null;
  const { coordinates, closest } = best;
  const left = coordinates.slice(0, closest.segmentIndex + 1).concat([closest.coordinate]);
  const right = coordinates.slice(closest.segmentIndex + 1).reverse().concat([closest.coordinate]);

  /* 西側から西条駅へ入る経路を優先。短すぎる場合は長い側を使用します。 */
  let route = left[0]?.[0] <= right[0]?.[0] ? left : right;
  if (polylineLengthMetres(route) < 160) {
    route = polylineLengthMetres(left) >= polylineLengthMetres(right) ? left : right;
  }
  if (route.length < 2 || polylineLengthMetres(route) < 80) return null;
  return route;
}

async function waitForActualRailwayRoute() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const route = actualRailwayRouteToSaijoStation();
    if (route) return route;
    await new Promise((resolve) => window.setTimeout(resolve, 140));
  }
  console.warn("Actual railway geometry was not available; using the aligned fallback route.");
  return INTRO_TRAIN_ROUTE;
}

function mapFlightArcCoordinates() {
  const bounds = state.map.getBounds();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const width = east - west;
  const height = north - south;
  const start = [west - width * 0.10, south + height * 0.18];
  const control = [west + width * 0.48, north + height * 0.23];
  const end = [east + width * 0.10, south + height * 0.70];
  const coordinates = [];

  for (let index = 0; index <= 80; index += 1) {
    const t = index / 80;
    const omt = 1 - t;
    coordinates.push([
      omt * omt * start[0] + 2 * omt * t * control[0] + t * t * end[0],
      omt * omt * start[1] + 2 * omt * t * control[1] + t * t * end[1]
    ]);
  }
  return coordinates;
}

function bearingBetweenCoordinates(from, to) {
  const rad = Math.PI / 180;
  const lat1 = from[1] * rad;
  const lat2 = to[1] * rad;
  const dLng = (to[0] - from[0]) * rad;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

function mapViewSnapshot() {
  if (!state.map) return null;
  const center = state.map.getCenter();
  return {
    center: [center.lng, center.lat],
    zoom: state.map.getZoom(),
    pitch: state.map.getPitch(),
    bearing: state.map.getBearing()
  };
}

function travelFocusView(mode) {
  const base = TRAVEL_FOCUS_VIEW[mode] || TRAVEL_FOCUS_VIEW.car;
  const mobile = window.matchMedia("(max-width: 720px)").matches;
  return {
    zoom: Math.max(state.map.getMinZoom(), base.zoom - (mobile ? 0.12 : 0)),
    pitch: udSettings.flatMap ? 0 : base.pitch
  };
}

function waitForCameraMove(duration = 600) {
  return new Promise((resolve) => {
    if (!state.map) {
      resolve();
      return;
    }
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    state.map.once("moveend", finish);
    window.setTimeout(finish, duration + 260);
  });
}

async function focusTravelCameraAt(coordinate, mode) {
  if (!state.map || !coordinate) return;
  const reducedMotion = prefersReducedMotion();
  const view = travelFocusView(mode);
  const waiting = waitForCameraMove(reducedMotion ? 0 : 520);

  state.map.easeTo({
    center: coordinate,
    zoom: view.zoom,
    pitch: view.pitch,
    bearing: 0,
    duration: reducedMotion ? 0 : 520,
    easing: (t) => 1 - Math.pow(1 - t, 3),
    essential: true
  });

  await waiting;
}

function followTravelCamera(coordinate, mode, force = false) {
  if (!state.map || !coordinate) return;
  const now = performance.now();
  if (!force && now - state.travelCameraLastPaint < 120) return;
  state.travelCameraLastPaint = now;

  // ズームと傾きは演出開始時に一度だけ設定し、走行中は中心だけ追従します。
  state.map.jumpTo({ center: coordinate, bearing: 0 });
}

async function returnTravelCameraToFixedPosition() {
  if (!state.map) return;
  const target = state.travelReturnView || state.initialMapView || {
    center: MAP_VIEW.center,
    zoom: MAP_VIEW.zoom,
    pitch: currentMapPitch(),
    bearing: MAP_VIEW.bearing
  };
  const reducedMotion = prefersReducedMotion();
  const duration = reducedMotion ? 0 : 760;
  const waiting = waitForCameraMove(duration);

  state.map.easeTo({
    center: target.center,
    zoom: target.zoom,
    pitch: target.pitch,
    bearing: target.bearing,
    duration,
    easing: (t) => 1 - Math.pow(1 - t, 3),
    essential: true
  });

  await waiting;
}

function buildTravelVehicleElement(mode) {
  const element = document.createElement("div");
  element.className = `map-travel-vehicle map-travel-${mode}`;

  if (mode === "car") {
    element.innerHTML = `
      <div class="map-travel-icon">
        <svg viewBox="0 0 64 104" role="img" aria-label="道路を前向きに進む青い車">
          <ellipse class="vehicle-shadow" cx="34" cy="55" rx="26" ry="43"/>
          <path class="vehicle-car-body" d="M15 18 Q17 7 32 4 Q47 7 49 18 L55 78 Q53 94 32 99 Q11 94 9 78 Z"/>
          <path class="vehicle-car-hood" d="M17 16 Q32 7 47 16 L45 32 H19 Z"/>
          <path class="vehicle-car-glass" d="M19 35 Q32 27 45 35 L47 56 H17 Z"/>
          <path class="vehicle-car-roof" d="M18 58 H46 L48 77 Q32 86 16 77 Z"/>
          <circle class="vehicle-headlight" cx="18" cy="17" r="4.2"/>
          <circle class="vehicle-headlight" cx="46" cy="17" r="4.2"/>
          <circle class="vehicle-tail-light" cx="17" cy="82" r="3.5"/>
          <circle class="vehicle-tail-light" cx="47" cy="82" r="3.5"/>
          <rect class="vehicle-wheel" x="5" y="26" width="8" height="22" rx="4"/>
          <rect class="vehicle-wheel" x="51" y="26" width="8" height="22" rx="4"/>
          <rect class="vehicle-wheel" x="5" y="65" width="8" height="22" rx="4"/>
          <rect class="vehicle-wheel" x="51" y="65" width="8" height="22" rx="4"/>
          <path class="vehicle-front-chevron" d="M32 0 L42 13 H36 V20 H28 V13 H22 Z"/>
        </svg>
      </div>`;
  } else if (mode === "train") {
    element.innerHTML = `
      <div class="map-travel-icon">
        <svg viewBox="0 0 70 132" role="img" aria-label="実際の地図の線路を進む赤い帯の電車">
          <ellipse class="vehicle-shadow" cx="37" cy="70" rx="27" ry="54"/>
          <path class="vehicle-train-body" d="M13 24 Q16 7 35 3 Q54 7 57 24 L58 103 Q55 122 35 128 Q15 122 12 103 Z"/>
          <path class="vehicle-train-front" d="M18 19 Q35 8 52 19 L50 49 H20 Z"/>
          <path class="vehicle-train-window" d="M21 22 Q35 14 49 22 L47 43 H23 Z"/>
          <path class="vehicle-train-band" d="M14 53 H56 V66 H14 Z"/>
          <rect class="vehicle-train-door" x="21" y="69" width="28" height="39" rx="5"/>
          <path class="vehicle-train-roof" d="M23 111 H47 L44 121 Q35 126 26 121 Z"/>
          <circle class="vehicle-headlight" cx="22" cy="18" r="4.5"/>
          <circle class="vehicle-headlight" cx="48" cy="18" r="4.5"/>
          <path class="vehicle-pantograph" d="M25 5 L35 -5 L45 5 M28 4 H42"/>
          <path class="vehicle-front-chevron" d="M35 -8 L45 6 H39 V13 H31 V6 H25 Z"/>
        </svg>
      </div>`;
  } else {
    element.innerHTML = `
      <div class="map-travel-icon map-travel-plane-icon">
        <svg viewBox="0 0 138 96" role="img" aria-label="地図上の弧を飛ぶ飛行機">
          <path class="plane-shadow" d="M8 50 L51 40 L73 7 Q78 0 84 7 L79 39 L125 45 Q134 46 134 51 Q134 56 125 57 L79 59 L86 89 L76 93 L54 63 L9 58 Z"/>
          <path class="plane-body" d="M4 45 L50 37 L73 5 Q78 -2 84 5 L79 37 L127 43 Q136 44 136 49 Q136 54 127 55 L79 57 L86 88 L76 92 L53 61 L4 55 Z"/>
          <path class="plane-wing-detail" d="M51 37 L79 37 M53 61 L79 57"/>
          <path class="plane-tail-detail" d="M74 9 L83 8 L81 27"/>
          <ellipse class="plane-cockpit" cx="118" cy="49" rx="9" ry="5.5"/>
          <circle class="plane-window" cx="99" cy="47" r="2.6"/>
          <circle class="plane-window" cx="90" cy="46" r="2.6"/>
          <circle class="plane-window" cx="81" cy="45" r="2.6"/>
          <ellipse class="plane-engine" cx="60" cy="32" rx="7.5" ry="4.5"/>
          <ellipse class="plane-engine" cx="60" cy="67" rx="7.5" ry="4.5"/>
          <path class="plane-map-contrail" d="M3 47 H-38 M3 55 H-31"/>
        </svg>
      </div>`;
  }

  return element;
}

function routeMetrics(coordinates) {
  const lengths = [];
  let total = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const length = metresBetween(
      { lng: coordinates[index][0], lat: coordinates[index][1] },
      { lng: coordinates[index + 1][0], lat: coordinates[index + 1][1] }
    );
    lengths.push(length);
    total += length;
  }
  return { lengths, total };
}

function positionOnRoute(coordinates, metrics, progress) {
  const target = metrics.total * Math.max(0, Math.min(1, progress));
  let travelled = 0;

  for (let index = 0; index < metrics.lengths.length; index += 1) {
    const segmentLength = metrics.lengths[index];
    if (travelled + segmentLength >= target || index === metrics.lengths.length - 1) {
      const local = segmentLength ? (target - travelled) / segmentLength : 0;
      const from = coordinates[index];
      const to = coordinates[index + 1];
      return {
        coordinate: [
          from[0] + (to[0] - from[0]) * local,
          from[1] + (to[1] - from[1]) * local
        ],
        from,
        to
      };
    }
    travelled += segmentLength;
  }

  const last = coordinates.at(-1);
  return { coordinate: last, from: coordinates.at(-2), to: last };
}

function screenRouteAngle(currentCoordinate, aheadCoordinate, mode = "car") {
  const current = state.map.project(currentCoordinate);
  const ahead = state.map.project(aheadCoordinate);
  const angleFromRight = Math.atan2(ahead.y - current.y, ahead.x - current.x) * 180 / Math.PI;
  /* 車と電車は上向き、飛行機は右向きのSVGなので基準角を分けます。 */
  return angleFromRight + (mode === "plane" ? 0 : 90);
}

function clearTravelVehicle() {
  if (state.travelAnimationFrame !== null) {
    cancelAnimationFrame(state.travelAnimationFrame);
    state.travelAnimationFrame = null;
  }
  state.travelVehicleMarker?.remove();
  state.travelVehicleMarker = null;
}

async function animateMapVehicle(coordinates, mode, duration) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return;

  clearTravelVehicle();
  setTravelRoute(coordinates, mode);
  await focusTravelCameraAt(coordinates[0], mode);

  return new Promise((resolve) => {
    const element = buildTravelVehicleElement(mode);
    const marker = new maplibregl.Marker({
      element,
      anchor: "center",
      pitchAlignment: "viewport",
      rotationAlignment: "viewport"
    })
      .setLngLat(coordinates[0])
      .addTo(state.map);

    state.travelVehicleMarker = marker;
    const icon = element.querySelector(".map-travel-icon");
    const metrics = routeMetrics(coordinates);
    const reducedMotion = prefersReducedMotion();
    const started = performance.now();
    const actualDuration = reducedMotion ? 100 : duration;
    let lastPaint = 0;
    let displayedAngle = screenRouteAngle(coordinates[0], coordinates[1], mode);

    state.travelCameraLastPaint = 0;
    followTravelCamera(coordinates[0], mode, true);

    const frame = (now) => {
      const raw = Math.min(1, (now - started) / actualDuration);

      /* マーカーとカメラを同時に約30fpsで更新します。 */
      if (raw >= 1 || now - lastPaint >= 33) {
        lastPaint = now;
        const eased = raw < 0.5
          ? 2 * raw * raw
          : 1 - Math.pow(-2 * raw + 2, 2) / 2;
        const point = positionOnRoute(coordinates, metrics, eased);
        const ahead = positionOnRoute(coordinates, metrics, Math.min(1, eased + 0.006));

        marker.setLngLat(point.coordinate);
        followTravelCamera(point.coordinate, mode);

        /* 地理方位ではなく、画面に投影した道の向きへ車体を合わせる。 */
        const targetAngle = screenRouteAngle(point.coordinate, ahead.coordinate, mode);
        const difference = ((targetAngle - displayedAngle + 540) % 360) - 180;
        displayedAngle += difference * 0.58;
        icon?.style.setProperty("--travel-bearing", `${displayedAngle}deg`);
      }

      if (raw < 1) {
        state.travelAnimationFrame = requestAnimationFrame(frame);
      } else {
        state.travelAnimationFrame = null;
        followTravelCamera(coordinates.at(-1), mode, true);
        window.setTimeout(resolve, reducedMotion ? 80 : 300);
      }
    };

    state.travelAnimationFrame = requestAnimationFrame(frame);
  });
}

function clearFlightOverlay() {
  state.travelFlightOverlay?.remove();
  state.travelFlightOverlay = null;
}

function animatePlaneAcrossMap(duration = 2800) {
  /* 飛行機もMapLibre Markerとして、地図座標の弧状ルート上を移動します。 */
  const coordinates = mapFlightArcCoordinates();
  return animateMapVehicle(coordinates, "plane", duration);
}

function finishTravelIntro(intro, complete, reducedMotion) {
  intro.classList.add("leaving");
  window.setTimeout(() => {
    intro.hidden = true;
    intro.className = "travel-intro";
    intro.setAttribute("aria-hidden", "true");
    state.isTravelIntroPlaying = false;
    document.body.classList.remove("travel-running");
    setTravelMapInteractionLock(false);
    clearTravelVehicle();
    clearFlightOverlay();
    emptyTravelRoute();
    complete();
  }, reducedMotion ? 60 : 360);
}

async function playTravelIntro(distanceMetres, onComplete) {
  const complete = typeof onComplete === "function" ? onComplete : () => {};

  /* 動きに敏感な利用者が「動きを減らす」を選んだ場合は、乗り物追跡を省略します。 */
  if (prefersReducedMotion()) {
    setStatus("移動アニメーションを省略しました。西条の酒蔵マップを表示します");
    complete();
    return;
  }

  /* 酒蔵エリア内なら移動演出は不要です。 */
  if (distanceMetres <= AREA_RADIUS_METERS || state.travelIntroPlayed) {
    complete();
    return;
  }

  const intro = $("travelIntro");
  if (!intro || !state.map?.getSource("travel-map-route")) {
    complete();
    return;
  }

  state.travelIntroPlayed = true;
  state.isTravelIntroPlaying = true;
  document.body.classList.add("travel-running");
  state.isProgrammaticCamera = true;
  state.travelReturnView = state.initialMapView
    ? {
        center: [...state.initialMapView.center],
        zoom: state.initialMapView.zoom,
        pitch: state.initialMapView.pitch,
        bearing: state.initialMapView.bearing
      }
    : mapViewSnapshot();
  setTravelMapInteractionLock(true);
  window.clearTimeout(state.introFallbackTimer);
  window.clearTimeout(state.travelIntroTimer);

  const mode = travelModeForDistance(distanceMetres);
  const reducedMotion = prefersReducedMotion();
  intro.className = `travel-intro mode-${mode}`;
  intro.hidden = false;
  intro.setAttribute("aria-hidden", "false");
  $("travelDistance").textContent = `現在地から酒蔵エリアまで、直線距離で${formatTravelDistance(distanceMetres)}です`;
  requestAnimationFrame(() => intro.classList.add("active"));

  try {
    if (mode === "car") {
      $("travelKicker").textContent = "酒蔵エリアから15キロ以内です";
      $("travelTitle").textContent = "地図の道路を車で進みます";
      setStatus("車を拡大表示し、地図の道路に沿って酒蔵エリアまで追いかけています");
      await animateMapVehicle(INTRO_CAR_ROUTE, "car", 3800);
    } else if (mode === "train") {
      $("travelKicker").textContent = "酒蔵エリアから15キロ以上です";
      $("travelTitle").textContent = "地図の線路を電車で進みます";
      setStatus("電車を拡大表示し、OpenStreetMapの線路上をJR西条駅まで追いかけています");
      await animateMapVehicle(await waitForActualRailwayRoute(), "train", 3900);
    } else {
      /* 飛行機へズームする前に、現在表示中のOSM線路から電車経路を確保します。 */
      const trainRoute = await waitForActualRailwayRoute();

      $("travelKicker").textContent = "酒蔵エリアから800キロ以上です";
      $("travelTitle").textContent = "飛行機で広島へ向かいます";
      setStatus("飛行機を拡大表示し、地図上の弧状ルートを追いかけています");
      await animatePlaneAcrossMap(3000);

      $("travelKicker").textContent = "飛行機から電車へ乗り換えます";
      $("travelTitle").textContent = "線路を通ってJR西条駅へ";
      setStatus("電車を拡大表示し、地図上の実際の線路を通ってJR西条駅へ進みます");
      await new Promise((resolve) => window.setTimeout(resolve, reducedMotion ? 60 : 420));
      await animateMapVehicle(trainRoute, "train", 3400);
    }
  } catch (error) {
    console.warn("Travel animation failed:", error);
  } finally {
    /* 到着したら乗り物を消し、マップを開いたときの定位置へ戻します。 */
    clearTravelVehicle();
    clearFlightOverlay();
    emptyTravelRoute();
    setStatus("到着しました。地図を最初の定位置へ戻しています");
    await returnTravelCameraToFixedPosition();
    state.travelReturnView = null;
    state.isProgrammaticCamera = false;
    finishTravelIntro(intro, complete, reducedMotion);
  }
}

function playExploreIntro() {
  state.introPlayed = true;
  return;
}

function __disabledPlayExploreIntro() {
  if (!state.ready || state.introPlayed) return;

  state.introPlayed = true;
  state.isIntroPlaying = true;
  state.isProgrammaticCamera = true;
  window.clearTimeout(state.introFallbackTimer);

  if (!state.initialMapView) captureInitialMapView(true);

  const intro = $("exploreIntro");
  const reducedMotion = prefersReducedMotion();
  intro.hidden = false;
  intro.setAttribute("aria-hidden", "false");
  document.body.classList.add("explore-starting");

  requestAnimationFrame(() => intro.classList.add("active"));

  /* 乗り物演出の直後にカメラを動かすと画面が揺れて見えるため、
     探索開始カードだけを表示し、地図カメラは現在位置のまま固定します。 */

  const visibleTime = reducedMotion ? 850 : 2650;
  window.setTimeout(() => {
    intro.classList.add("leaving");
    document.body.classList.remove("explore-starting");

    window.setTimeout(() => {
      intro.hidden = true;
      intro.classList.remove("active", "leaving");
      intro.setAttribute("aria-hidden", "true");
      state.isIntroPlaying = false;
      state.isProgrammaticCamera = false;
      syncAvatarTransparency();
      updateUserPeek();
      setStatus("探索スタート。7つの酒蔵とくぐり門をめぐりましょう");
    }, reducedMotion ? 80 : 480);
  }, visibleTime);
}

function updateAvatarFacing() {
  if (!state.map) return;
  const faceFront = state.isZooming || state.map.getZoom() >= 18;
  if (state.lastAvatarFacing === faceFront) return;
  state.lastAvatarFacing = faceFront;
  state.userMarker?.getElement()?.classList.toggle("front-facing", faceFront);
  $("userPeek")?.classList.toggle("front-facing", faceFront);
}

function createUserMarker() {
  const element = document.createElement("div");
  element.className = "user-marker";
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", "現在地");
  element.innerHTML = `
    <span class="user-heading-arrow" aria-hidden="true">▲</span>
    <svg viewBox="0 0 82 118" aria-hidden="true">
      <!-- 通常時：進行方向へ向かう後ろ姿 -->
      <g class="avatar-normal-view">
        <ellipse cx="41" cy="111" rx="26" ry="7" fill="rgba(0,0,0,.25)"/>
        <g class="left-leg">
          <path d="M32 74 L25 105 L36 105 L43 75 Z" fill="#264255"/>
          <path d="M22 101 H37 V112 H19 Q14 107 22 101" fill="#17252f"/>
        </g>
        <g class="right-leg">
          <path d="M46 74 L49 105 L60 105 L56 73 Z" fill="#264255"/>
          <path d="M48 101 H63 Q70 107 63 112 H48 Z" fill="#17252f"/>
        </g>
        <path d="M27 43 Q41 35 55 43 L60 79 H22 Z" fill="#f1b62f" stroke="#fff" stroke-width="3"/>
        <path d="M28 48 Q41 40 54 48 L57 75 H25 Z" fill="#28755f" stroke="#fff" stroke-width="3"/>
        <path d="M38 44 V76" fill="none" stroke="#174e40" stroke-width="3" stroke-linecap="round"/>
        <g class="left-arm">
          <path d="M28 47 L12 70 L21 76 L37 53" fill="#f1b62f" stroke="#fff" stroke-width="3"/>
          <circle cx="17" cy="75" r="5.5" fill="#efbb95"/>
        </g>
        <g class="right-arm">
          <path d="M54 47 L69 70 L61 76 L45 53" fill="#f1b62f" stroke="#fff" stroke-width="3"/>
          <circle cx="65" cy="75" r="5.5" fill="#efbb95"/>
        </g>
        <circle cx="41" cy="29" r="18" fill="#efbb95" stroke="#fff" stroke-width="3"/>
        <path d="M23 31 Q22 9 42 8 Q62 9 61 31 Q53 22 41 22 Q30 22 23 31 Z" fill="#1b252b"/>
        <path d="M24 17 Q40 4 59 17 L57 25 Q41 17 24 25 Z" fill="#243842"/>
      </g>

      <!-- ズーム時：利用者の方を向く正面姿 -->
      <g class="avatar-front-view">
        <ellipse cx="41" cy="111" rx="27" ry="7" fill="rgba(0,0,0,.22)"/>
        <path d="M29 76 L24 105 H37 L42 76 Z" fill="#264255"/>
        <path d="M45 76 L50 105 H63 L55 76 Z" fill="#264255"/>
        <path d="M20 102 H38 V112 H18 Q13 107 20 102" fill="#17252f"/>
        <path d="M48 102 H64 Q71 107 64 112 H48 Z" fill="#17252f"/>
        <path d="M24 45 Q41 34 58 45 L62 80 H20 Z" fill="#f1b62f" stroke="#fff" stroke-width="3"/>
        <path d="M41 43 V79" stroke="#9a6b00" stroke-width="3" stroke-linecap="round"/>
        <circle cx="41" cy="61" r="4" fill="#fff4c7" stroke="#9a6b00" stroke-width="2"/>
        <path d="M26 48 L10 70 L20 77 L34 54" fill="#f1b62f" stroke="#fff" stroke-width="3"/>
        <path d="M56 48 L72 70 L62 77 L48 54" fill="#f1b62f" stroke="#fff" stroke-width="3"/>
        <circle cx="15" cy="75" r="5.5" fill="#efbb95"/>
        <circle cx="67" cy="75" r="5.5" fill="#efbb95"/>
        <circle cx="41" cy="29" r="25" fill="#efbb95" stroke="#fff" stroke-width="3.5"/>
        <path d="M16 29 Q16 2 42 2 Q69 3 67 31 Q58 17 41 18 Q25 17 16 29 Z" fill="#1b252b"/>
        <path d="M18 14 Q40 -1 65 14 L62 24 Q41 14 19 24 Z" fill="#243842"/>
        <circle cx="32" cy="30" r="2.8" fill="#172229"/>
        <circle cx="51" cy="30" r="2.8" fill="#172229"/>
        <path d="M31 41 Q41 49 52 41" fill="none" stroke="#754130" stroke-width="2.8" stroke-linecap="round"/>
      </g>
    </svg>
  `;
  return element;
}

function addUserAccuracyLayers() {
  state.map.addSource("user-accuracy", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] }
  });

  state.map.addLayer({
    id: "user-accuracy-fill",
    type: "fill",
    source: "user-accuracy",
    paint: {
      "fill-color": "#ffca28",
      "fill-opacity": 0.14
    }
  });

  state.map.addLayer({
    id: "user-accuracy-line",
    type: "line",
    source: "user-accuracy",
    paint: {
      "line-color": "#8b2635",
      "line-width": 2.5,
      "line-dasharray": [2, 2]
    }
  });
}


function isInsideNavigationArea(position) {
  if (!position) return false;
  const [[west, south], [east, north]] = NAVIGATION_BOUNDS;
  return position.lng >= west && position.lng <= east
    && position.lat >= south && position.lat <= north;
}

/*
  v14: 見えない境界。
  地図タイルや遠景は切り抜かずそのまま描画し、カメラ中心だけを酒蔵エリア内へ固定します。
  maxBounds に加えて moveend でも中心をクランプするため、ドラッグ・慣性移動・fitBounds の
  どの操作からもエリア外へ抜けません。
*/
function enforceNavigationBounds() {
  if (!state.map) return;
  const [[west, south], [east, north]] = NAVIGATION_BOUNDS;
  const center = state.map.getCenter();
  const lng = Math.min(east, Math.max(west, center.lng));
  const lat = Math.min(north, Math.max(south, center.lat));

  state.map.setMaxBounds(MAPLIBRE_VIEW_BOUNDS);

  if (Math.abs(center.lng - lng) > 1e-9 || Math.abs(center.lat - lat) > 1e-9) {
    state.map.jumpTo({ center: [lng, lat] });
  }
}

function routeNodePosition(nodeId, extraNodes = {}) {
  return extraNodes[nodeId] || ROUTE_NODES[nodeId] || null;
}

function nearestRouteNodes(position, count = 2) {
  return Object.entries(ROUTE_NODES)
    .map(([id, coordinate]) => ({
      id,
      distance: metresBetween(position, { lng: coordinate[0], lat: coordinate[1] })
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
}

function buildRouteGraph(extraStart = null) {
  const graph = new Map();
  const extraNodes = {};
  const edges = ROUTE_EDGES.map((edge) => [...edge]);

  const ensureNode = (id) => {
    if (!graph.has(id)) graph.set(id, []);
  };

  Object.keys(ROUTE_NODES).forEach(ensureNode);

  if (extraStart) {
    extraNodes[extraStart.id] = extraStart.coordinate;
    ensureNode(extraStart.id);
    nearestRouteNodes(
      { lng: extraStart.coordinate[0], lat: extraStart.coordinate[1] },
      2
    ).forEach(({ id }) => edges.push([extraStart.id, id]));
  }

  edges.forEach(([from, to]) => {
    ensureNode(from);
    ensureNode(to);
    const fromCoordinate = routeNodePosition(from, extraNodes);
    const toCoordinate = routeNodePosition(to, extraNodes);
    if (!fromCoordinate || !toCoordinate) return;
    const weight = metresBetween(
      { lng: fromCoordinate[0], lat: fromCoordinate[1] },
      { lng: toCoordinate[0], lat: toCoordinate[1] }
    );
    graph.get(from).push({ id: to, weight });
    graph.get(to).push({ id: from, weight });
  });

  return { graph, extraNodes };
}

function shortestRoute(startId, destinationId, extraStart = null) {
  const { graph, extraNodes } = buildRouteGraph(extraStart);
  if (!graph.has(startId) || !graph.has(destinationId)) return null;

  const distance = new Map();
  const previous = new Map();
  const unvisited = new Set(graph.keys());
  graph.forEach((_, id) => distance.set(id, Infinity));
  distance.set(startId, 0);

  while (unvisited.size) {
    let current = null;
    let currentDistance = Infinity;
    unvisited.forEach((id) => {
      const value = distance.get(id);
      if (value < currentDistance) {
        current = id;
        currentDistance = value;
      }
    });

    if (current === null || currentDistance === Infinity) break;
    unvisited.delete(current);
    if (current === destinationId) break;

    (graph.get(current) || []).forEach((edge) => {
      if (!unvisited.has(edge.id)) return;
      const nextDistance = currentDistance + edge.weight;
      if (nextDistance < distance.get(edge.id)) {
        distance.set(edge.id, nextDistance);
        previous.set(edge.id, current);
      }
    });
  }

  if (!Number.isFinite(distance.get(destinationId))) return null;

  const path = [];
  let cursor = destinationId;
  while (cursor) {
    path.unshift(cursor);
    if (cursor === startId) break;
    cursor = previous.get(cursor);
  }
  if (path[0] !== startId) return null;

  return {
    nodeIds: path,
    /* 白い案内道路と同じ辺のGeoJSONを連結して、青線を完全に重ねます。 */
    coordinates: coordinatesAlongWhiteRoad(path, extraNodes),
    distance: distance.get(destinationId)
  };
}

function defaultRouteStart() {
  if (!state.userPosition) return null;
  return {
    id: "current-user-route-start",
    name: "現在地",
    coordinate: [state.userPosition.lng, state.userPosition.lat],
    temporary: true,
    outsideLocalArea: !isInsideNavigationArea(state.userPosition)
  };
}

function updateRouteMarkerClasses(startId = null, destinationId = null) {
  state.markers.forEach((marker, id) => {
    const element = marker.getElement();
    element.classList.toggle("route-start", id === startId);
    element.classList.toggle("route-destination", id === destinationId);
  });
}

function formatRouteDistance(distance) {
  return distance >= 1000
    ? `${(distance / 1000).toFixed(1)} km`
    : `${Math.max(1, Math.round(distance))} m`;
}

function cancelRouteCameraAnimation() {
  if (state.routeCameraAnimationFrame !== null) {
    cancelAnimationFrame(state.routeCameraAnimationFrame);
    state.routeCameraAnimationFrame = null;
  }
  state.routeCameraSerial += 1;
  state.isProgrammaticCamera = false;
}

function normalizeBearing(value) {
  let bearing = Number(value);
  if (!Number.isFinite(bearing)) return null;
  bearing %= 360;
  if (bearing < 0) bearing += 360;
  return bearing;
}

function deriveMovementHeading(previous, next) {
  if (!previous || !next) return null;
  const moved = metresBetween(previous, next);
  if (!Number.isFinite(moved) || moved < 1.5 || moved > 80) return null;
  return normalizeBearing(bearingBetweenCoordinates([previous.lng, previous.lat], [next.lng, next.lat]));
}

function preferredMapBearing() {
  const user = state.userPosition;
  if (user && isInsideNavigationArea(user) && Number.isFinite(user.heading)) return normalizeBearing(user.heading) ?? state.map?.getBearing() ?? 0;
  return state.map?.getBearing() ?? 0;
}

function updateUserHeadingArrow() {
  const arrow = state.userMarker?.getElement().querySelector(".user-heading-arrow");
  const heading = state.userPosition?.heading;
  if (!arrow) return;
  if (!Number.isFinite(heading)) { arrow.hidden = true; return; }
  arrow.hidden = false;
  const mapBearing = state.map?.getBearing?.() || 0;
  const relative = normalizeBearing(heading - mapBearing) ?? 0;
  arrow.style.transform = `translateX(-50%) rotate(${relative}deg)`;
}

function keepUserHeadingAtTop(next) {
  if (!state.map || !next || !Number.isFinite(next.heading)) return;
  if (!isInsideNavigationArea(next)) return;
  if (state.isProgrammaticCamera || state.isTravelIntroPlaying || state.userZoomGestureActive) return;
  const heading = normalizeBearing(next.heading);
  if (heading === null) return;
  const current = normalizeBearing(state.map.getBearing()) ?? 0;
  let delta = Math.abs(heading - current);
  delta = Math.min(delta, 360 - delta);
  if (delta < 1.2) return;
  state.lastHeadingBearing = heading;
  state.map.easeTo({ bearing: heading, duration: prefersReducedMotion() ? 0 : 260, easing: (t) => t, essential: true });
}

function routeCameraPathMetrics(coordinates) {
  const safe = Array.isArray(coordinates) ? coordinates.filter((c) => Array.isArray(c) && c.length >= 2) : [];
  if (safe.length < 2) return null;
  const segments = [];
  let total = 0;
  for (let i = 0; i < safe.length - 1; i += 1) {
    const a = safe[i];
    const b = safe[i + 1];
    const length = metresBetween({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] });
    if (!Number.isFinite(length) || length <= 0) continue;
    segments.push({ a, b, start: total, length });
    total += length;
  }
  return total > 0 ? { coordinates: safe, segments, total } : null;
}

function routeCameraPointAt(metrics, progress) {
  if (!metrics) return null;
  const target = Math.max(0, Math.min(1, progress)) * metrics.total;
  for (const segment of metrics.segments) {
    if (target <= segment.start + segment.length) {
      const local = (target - segment.start) / segment.length;
      return [
        segment.a[0] + (segment.b[0] - segment.a[0]) * local,
        segment.a[1] + (segment.b[1] - segment.a[1]) * local
      ];
    }
  }
  return metrics.coordinates[metrics.coordinates.length - 1];
}

function routeTraceZoom(distanceMetres, nearStart = false) {
  const distance = Number(distanceMetres || 0);
  if (nearStart) {
    if (distance <= 240) return 18.15;
    if (distance <= 550) return 17.85;
    return 17.45;
  }
  if (distance <= 220) return 17.95;
  if (distance <= 500) return 17.55;
  if (distance <= 950) return 17.05;
  return 16.55;
}

function easeRouteCameraTo(coordinate, { zoom, duration = 560, offset = [0, 0] } = {}) {
  return new Promise((resolve) => {
    if (!state.map || !coordinate) return resolve(false);
    const serial = state.routeCameraSerial;
    const pitch = udSettings.flatMap ? 0 : state.map.getPitch();
    const bearing = state.map.getBearing();
    if (prefersReducedMotion() || duration <= 0) {
      state.map.jumpTo({ center: coordinate, zoom, pitch, bearing });
      return resolve(true);
    }
    state.isProgrammaticCamera = true;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      state.map.off("moveend", finish);
      if (serial === state.routeCameraSerial) state.isProgrammaticCamera = false;
      resolve(serial === state.routeCameraSerial);
    };
    state.map.on("moveend", finish);
    state.map.easeTo({
      center: coordinate,
      zoom,
      pitch,
      bearing,
      offset,
      duration,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      essential: true
    });
    window.setTimeout(finish, duration + 180);
  });
}

function animateRouteCameraAlong(coordinates, { zoom, duration = 2600 } = {}) {
  return new Promise((resolve) => {
    const metrics = routeCameraPathMetrics(coordinates);
    if (!state.map || !metrics) return resolve(false);
    const serial = state.routeCameraSerial;
    const pitch = udSettings.flatMap ? 0 : state.map.getPitch();
    const bearing = state.map.getBearing();
    const startTime = performance.now();
    state.isProgrammaticCamera = true;

    const finish = (ok) => {
      if (state.routeCameraAnimationFrame !== null) {
        cancelAnimationFrame(state.routeCameraAnimationFrame);
        state.routeCameraAnimationFrame = null;
      }
      if (serial === state.routeCameraSerial) state.isProgrammaticCamera = false;
      resolve(ok && serial === state.routeCameraSerial);
    };

    const frame = (now) => {
      if (serial !== state.routeCameraSerial) return finish(false);
      const raw = Math.min(1, (now - startTime) / Math.max(1, duration));
      const eased = raw < 0.5
        ? 2 * raw * raw
        : 1 - Math.pow(-2 * raw + 2, 2) / 2;
      const center = routeCameraPointAt(metrics, eased);
      if (center) {
        state.map.jumpTo({ center, zoom, pitch, bearing });
      }
      if (raw >= 1) return finish(true);
      state.routeCameraAnimationFrame = requestAnimationFrame(frame);
    };

    state.routeCameraAnimationFrame = requestAnimationFrame(frame);
  });
}

function userIsWithinFiveMetresOfRouteStart(start) {
  if (!state.userPosition || !start?.coordinate) return false;
  if (!isInsideNavigationArea(state.userPosition)) return false;
  const startPoint = { lng: start.coordinate[0], lat: start.coordinate[1] };
  return metresBetween(state.userPosition, startPoint) <= 5;
}

function localCameraCoordinates(coordinates) {
  if (!Array.isArray(coordinates)) return [];
  return coordinates.filter((coordinate) => isInsideNavigationArea({ lng: coordinate[0], lat: coordinate[1] }));
}

async function presentActiveRoute(start, destination, coordinates, distance, { external = false } = {}) {
  if (!state.map || !Array.isArray(coordinates) || coordinates.length < 2) return;
  cancelRouteCameraAnimation();

  /* エリア外の現在地を出発地にしてもルート機能は使えるが、カメラだけは現在地を追わない。 */
  if (start?.temporary && start?.outsideLocalArea) {
    const localCoordinates = localCameraCoordinates(coordinates);
    if (localCoordinates.length >= 2) fitActiveRoute(localCoordinates);
    else {
      state.map.easeTo({
        center: [destination.lng, destination.lat],
        zoom: Math.max(16.6, Math.min(17.8, state.map.getZoom())),
        pitch: udSettings.flatMap ? 0 : state.map.getPitch(),
        bearing: state.map.getBearing(),
        duration: prefersReducedMotion() ? 0 : 620
      });
    }
    return;
  }

  if (prefersReducedMotion()) {
    if (external) fitExternalRoute(coordinates, distance);
    else fitActiveRoute(coordinates);
    return;
  }

  const nearStart = userIsWithinFiveMetresOfRouteStart(start);
  const traceZoom = routeTraceZoom(distance, nearStart);
  const traceDuration = Math.max(1700, Math.min(3900, 1600 + Number(distance || 0) * 2.8));

  if (nearStart) {
    /* スタート5m以内：まずゴールへ飛び、青い道を逆向きにたどって現在地へ戻る。 */
    const goal = coordinates[coordinates.length - 1];
    const moved = await easeRouteCameraTo(goal, { zoom: traceZoom, duration: 620 });
    if (!moved) return;
    const traced = await animateRouteCameraAlong([...coordinates].reverse(), { zoom: traceZoom, duration: traceDuration });
    if (!traced || !state.userPosition || !isInsideNavigationArea(state.userPosition)) return;
    await easeRouteCameraTo([state.userPosition.lng, state.userPosition.lat], {
      zoom: Math.max(traceZoom, 18.1),
      duration: 460,
      offset: [0, userBottomCenterOffset()]
    });
    return;
  }

  /* スタートから5m以上離れている：スタート→ゴールを俯瞰のままトレースする。 */
  const startPoint = coordinates[0];
  const moved = await easeRouteCameraTo(startPoint, { zoom: traceZoom, duration: 520 });
  if (!moved) return;
  await animateRouteCameraAlong(coordinates, { zoom: traceZoom, duration: traceDuration });
}

function fitActiveRoute(coordinates) {
  if (!coordinates || coordinates.length < 2) return;
  const bounds = new maplibregl.LngLatBounds();
  coordinates.forEach((coordinate) => bounds.extend(coordinate));

  /*
    v28: 青い道を出した瞬間に視点角度を変えない。
    利用者が見ていた俯瞰角度・方位をそのまま保ち、中心と倍率だけをルートへ合わせる。
  */
  const keepPitch = udSettings.flatMap ? 0 : state.map.getPitch();
  const keepBearing = state.map.getBearing();
  state.map.fitBounds(bounds, {
    padding: window.matchMedia("(max-width: 720px)").matches
      ? { top: 150, right: 42, bottom: 205, left: 42 }
      : { top: 138, right: 92, bottom: 190, left: 92 },
    maxZoom: 18.25,
    pitch: keepPitch,
    bearing: keepBearing,
    duration: prefersReducedMotion() ? 0 : 700
  });
}

function enableGlobalRouteView() {
  if (!state.map) return;
  /*
    v14: 遠距離ルートでも酒蔵エリアの境界は解除しません。
    外側の景色・地図タイルは見えますが、カメラ中心は常に酒蔵エリア内です。
  */
  state.globalRouteMode = true;
  state.map.setMaxBounds(MAPLIBRE_VIEW_BOUNDS);
  state.map.setMinZoom(LOCAL_MAP_MIN_ZOOM);
}

function restoreLocalRouteView() {
  if (!state.map) return;
  state.globalRouteMode = false;
  state.map.setMinZoom(LOCAL_MAP_MIN_ZOOM);
  state.map.setMaxBounds(MAPLIBRE_VIEW_BOUNDS);
}

function fitExternalRoute(coordinates, distanceMetres) {
  if (!coordinates || coordinates.length < 2) return;
  enableGlobalRouteView();
  const bounds = new maplibregl.LngLatBounds();
  coordinates.forEach((coordinate) => bounds.extend(coordinate));
  const longDistance = Number(distanceMetres || 0) > 30000;
  const keepPitch = udSettings.flatMap ? 0 : state.map.getPitch();
  const keepBearing = state.map.getBearing();
  state.map.fitBounds(bounds, {
    padding: window.matchMedia("(max-width: 720px)").matches
      ? { top: 132, right: 34, bottom: 190, left: 34 }
      : { top: 120, right: 90, bottom: 180, left: 90 },
    maxZoom: longDistance ? 13.5 : 17.8,
    pitch: keepPitch,
    bearing: keepBearing,
    duration: prefersReducedMotion() ? 0 : 760
  });
}

function externalRouteMessage(start, destination, distance, fallback = false) {
  const label = fallback ? "道路に沿った案内ルート" : "徒歩ルート";
  return `${start.name} → ${destination.name}　${formatRouteDistance(distance)}　${label}`;
}

/*
  v23: 出発・到着の青線を建物中心まで突っ込ませない。
  経路計算そのものは変えず、表示用LineStringの両端だけ数m短くする。
  line-cap: round と組み合わせ、道路上で自然に始まり・終わる。
*/
function routeEndpointTrimDistance(endpoint, fallbackType = "spot") {
  if (!endpoint || endpoint.temporary) return 0;
  const place = PLACES.find((item) => item.id === endpoint.id) || endpoint;
  const type = place.type || fallbackType;
  if (type === "brewery") return 7.5;
  if (type === "gate") return 6.0;
  if (type === "station") return 5.5;
  return 3.5;
}

function trimPolylineFromStart(coordinates, trimMetres) {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || trimMetres <= 0) {
    return Array.isArray(coordinates) ? coordinates.map((c) => [...c]) : [];
  }
  let remaining = trimMetres;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const a = coordinates[index];
    const b = coordinates[index + 1];
    const segmentLength = metresBetween(
      { lng: a[0], lat: a[1] },
      { lng: b[0], lat: b[1] }
    );
    if (!Number.isFinite(segmentLength) || segmentLength <= 0) continue;
    if (remaining < segmentLength) {
      const t = remaining / segmentLength;
      const cut = [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t
      ];
      return [cut, ...coordinates.slice(index + 1).map((c) => [...c])];
    }
    remaining -= segmentLength;
  }
  return coordinates.map((c) => [...c]);
}

function trimRouteDisplayCoordinates(start, destination, coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return coordinates || [];
  const total = polylineLengthMetres(coordinates);
  if (!Number.isFinite(total) || total < 10) return coordinates.map((c) => [...c]);

  let startTrim = routeEndpointTrimDistance(start);
  let endTrim = routeEndpointTrimDistance(destination, destination?.type || "spot");

  /* 短い経路で両端を切り過ぎない。最低でも経路の約62%は残す。 */
  const maxCombinedTrim = total * 0.38;
  const requested = startTrim + endTrim;
  if (requested > maxCombinedTrim && requested > 0) {
    const scale = maxCombinedTrim / requested;
    startTrim *= scale;
    endTrim *= scale;
  }

  let result = trimPolylineFromStart(coordinates, startTrim);
  result = trimPolylineFromStart([...result].reverse(), endTrim).reverse();
  return result.length >= 2 ? result : coordinates.map((c) => [...c]);
}

function applyExternalRoute(start, place, coordinates, distance, { fit = true, fallback = false } = {}) {
  const startPosition = { lng: start.coordinate[0], lat: start.coordinate[1] };
  const destinationPosition = { lng: place.lng, lat: place.lat };
  const localRoute = isInsideNavigationArea(startPosition) && isInsideNavigationArea(destinationPosition);
  const displayCoordinates = trimRouteDisplayCoordinates(start, place, coordinates);

  const feature = {
    type: "Feature",
    properties: {
      startName: start.name,
      destinationName: place.name,
      distance,
      external: !localRoute,
      fallback
    },
    geometry: { type: "LineString", coordinates: displayCoordinates }
  };

  state.map.getSource("active-blue-route")?.setData({
    type: "FeatureCollection",
    features: [feature]
  });

  state.activeRoute = {
    start,
    destination: place,
    coordinates: displayCoordinates,
    rawCoordinates: coordinates,
    distance,
    external: !localRoute,
    fallback,
    roadFollowing: true
  };

  if (localRoute) restoreLocalRouteView();
  else enableGlobalRouteView();

  refreshActiveRouteTopLayer();
  updateRouteMarkerClasses(start.temporary ? null : start.id, place.id);
  const message = localRoute
    ? plannerMessage(start, place, distance)
    : externalRouteMessage(start, place, distance, fallback);
  if ($("routeSummary")) $("routeSummary").textContent = message;
  if ($("clearRouteButton")) $("clearRouteButton").disabled = false;
  if ($("clearPlannerRouteButton")) $("clearPlannerRouteButton").disabled = false;
  syncRoutePlannerFromActiveRoute();
  if ($("routePlannerResult")) setRoutePlannerResult(message, false);
  if (fit) {
    presentActiveRoute(start, place, displayCoordinates, distance, { external: !localRoute });
  }
  compactRoutePlannerAfterRoute();
  setStatus(`${place.name}まで、道路に沿った青いルートを表示しています`);
}


async function requestRoadFollowingRoute(start, place, serial) {
  const [startLng, startLat] = start.coordinate;
  const destination = [place.lng, place.lat];
  const endpoints = [PEDESTRIAN_ROUTE_ENDPOINT];
  let lastError = null;

  for (let index = 0; index < endpoints.length; index += 1) {
    if (serial !== state.routeRequestSerial) return null;
    const endpoint = endpoints[index];
    const url = `${endpoint}/${startLng},${startLat};${destination[0]},${destination[1]}?overview=full&geometries=geojson&steps=false&alternatives=false&generate_hints=false`;
    const controller = new AbortController();
    state.routeRequestController = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), ROUTE_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "Accept": "application/json" },
        cache: "no-store"
      });
      window.clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`Route HTTP ${response.status}`);
      const data = await response.json();
      if (serial !== state.routeRequestSerial) return null;
      const route = data?.routes?.[0];
      const coordinates = route?.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        throw new Error("Route geometry unavailable");
      }
      return {
        coordinates,
        distance: Number(route.distance || 0),
        fallback: index > 0,
        source: index === 0 ? "foot" : "road"
      };
    } catch (error) {
      window.clearTimeout(timeoutId);
      if (serial !== state.routeRequestSerial) return null;
      lastError = error;
    }
  }

  console.warn("Road-following route service unavailable; keeping the local guide route.", lastError);
  return null;
}

async function upgradeVisibleRouteToRoadGeometry(start, place, { fit = false } = {}) {
  const serial = ++state.routeRequestSerial;
  const exact = await requestRoadFollowingRoute(start, place, serial);
  if (!exact || serial !== state.routeRequestSerial) return false;
  if (!state.activeRoute || state.activeRoute.start?.id !== start.id || state.activeRoute.destination?.id !== place.id) {
    return false;
  }

  applyExternalRoute(
    start,
    place,
    exact.coordinates,
    exact.distance,
    { fit, fallback: exact.fallback }
  );
  state.activeRoute.roadFollowing = true;
  state.activeRoute.routeSource = exact.source;
  refreshActiveRouteTopLayer();
  state.map?.triggerRepaint?.();
  return true;
}

async function drawExternalRouteFromCurrent(start, place, { fit = true } = {}) {
  state.routeRequestController?.abort();
  state.routeRequestSerial += 1;
  const serial = state.routeRequestSerial;

  const startPosition = { lng: start.coordinate[0], lat: start.coordinate[1] };
  const destinationPosition = { lng: place.lng, lat: place.lat };
  const localRoute = isInsideNavigationArea(startPosition) && isInsideNavigationArea(destinationPosition);
  if (localRoute) restoreLocalRouteView();
  else enableGlobalRouteView();

  const searchingMessage = `${start.name}から${place.name}まで、道路に沿った徒歩ルートを検索しています`;
  if ($("routeSummary")) $("routeSummary").textContent = searchingMessage;
  if ($("routePlannerResult")) setRoutePlannerResult(searchingMessage, false);
  setStatus(searchingMessage);

  const exact = await requestRoadFollowingRoute(start, place, serial);
  if (serial !== state.routeRequestSerial) return;
  if (exact) {
    applyExternalRoute(
      start,
      place,
      exact.coordinates,
      exact.distance,
      { fit, fallback: exact.fallback }
    );
    state.activeRoute.routeSource = exact.source;
    state.map?.triggerRepaint?.();
    return;
  }

  const message = "道路に沿った徒歩ルートを取得できませんでした。出発地を拠点に変更してもう一度お試しください。";
  if ($("routeSummary")) $("routeSummary").textContent = message;
  if ($("routePlannerResult")) setRoutePlannerResult(message, true);
  setStatus(message);
}

function drawRouteTo(place, { fit = true } = {}) {
  if (!state.ready || !place) return false;

  const start = state.routeStart || defaultRouteStart();
  if (!start) {
    clearActiveRoute(false);
    if ($("routeSummary")) $("routeSummary").textContent = "位置情報を許可するか、ルート画面で出発地を選んでください";
    setStatus("出発地を選んでください");
    return false;
  }

  const localStartId = !start.temporary && ROUTE_NODES[start.id] ? start.id : null;
  const localDestinationId = ROUTE_NODES[place.id] ? place.id : null;

  if (localStartId && localDestinationId) {
    /*
      v11: まず内蔵ネットワークで青ルートを即表示します。
      その直後にFOSSGIS/OSRMの徒歩ルートを1回取得し、成功した場合だけ
      同じ青レイヤーを実道路の細かなGeoJSON形状へ差し替えます。
      APIが失敗しても、すでに見えている案内線は消しません。
    */
    state.routeRequestController?.abort();
    state.routeRequestSerial += 1;
    const route = shortestRoute(localStartId, localDestinationId);
    if (!route || !Array.isArray(route.coordinates) || route.coordinates.length < 2) {
      clearActiveRoute(false);
      setStatus("この拠点間のルートを表示できません");
      return false;
    }

    applyExternalRoute(
      start,
      place,
      route.coordinates,
      route.distance,
      { fit, fallback: true }
    );
    state.activeRoute.roadFollowing = false;
    state.activeRoute.routeSource = "local";
    refreshActiveRouteTopLayer();
    state.map?.triggerRepaint?.();

    /* 実道路形状への更新は非同期。失敗時は表示中のローカル案内線を保持します。 */
    upgradeVisibleRouteToRoadGeometry(start, place, { fit: false });
    return true;
  }

  drawExternalRouteFromCurrent(start, place, { fit });
  return "pending";
}

function setSelectedPlaceAsRouteStart() {
  if (!state.selected || !ROUTE_NODES[state.selected.id]) return;
  state.routeStart = {
    id: state.selected.id,
    name: state.selected.name,
    coordinate: [state.selected.lng, state.selected.lat],
    temporary: false
  };
  clearActiveRoute(false);
  updateRouteMarkerClasses(state.selected.id, null);
  $("routeSummary").textContent = `出発地：${state.selected.name}。次の酒蔵または西条駅を選んでください`;
  syncRoutePlannerFromActiveRoute();
  openRoutePlanner();
  setStatus(`${state.selected.name}を出発地に設定しました`);
}

function clearActiveRoute(resetStart = true) {
  cancelRouteCameraAnimation();
  stopRouteGlowAnimation();
  state.routeRequestController?.abort();
  state.routeRequestController = null;
  state.routeRequestSerial += 1;
  state.map?.getSource("active-blue-route")?.setData({
    type: "FeatureCollection",
    features: []
  });
  state.activeRoute = null;
  setRoutePlannerCompact(false);
  clearActiveRouteTopCanvas();
  updateRouteBuildingReadability(true);
  restoreLocalRouteView();
  if (resetStart) state.routeStart = null;
  updateRouteMarkerClasses(resetStart ? null : state.routeStart?.id, null);
  if ($("clearRouteButton")) $("clearRouteButton").disabled = true;
  if ($("clearPlannerRouteButton")) $("clearPlannerRouteButton").disabled = true;
  if ($("routeSummary")) {
    $("routeSummary").textContent = resetStart
      ? "通常の道は白色です。行き先を選んだときだけ青い案内ルートを表示します"
      : $("routeSummary").textContent;
  }
  syncRoutePlannerFromActiveRoute();
  if (resetStart) setStatus("青い案内ルートを消しました");
}


function walkingMinutes(distanceMetres) {
  return Math.max(1, Math.ceil(Number(distanceMetres || 0) / 75));
}

function routePlaceOptionLabel(place) {
  const local = localizedPlace(place);
  if (place.type === "station") return `駅　${local.localizedName}`;
  if (place.type === "gate") return `門　${local.localizedName}`;
  if (place.type === "spot") return `周辺　${local.localizedName}`;
  return `${place.number}　${local.localizedName}`;
}

function plannerMessage(start, destination, distance) {
  const minutes = walkingMinutes(distance);
  const startName = start.temporary
    ? uiText("currentLocation")
    : localizedPlace(PLACES.find((item) => item.id === start.id) || start).localizedName;
  const destinationName = localizedPlace(destination).localizedName;
  const formattedDistance = formatRouteDistance(distance);
  const language = udSettings.language;
  if (language === "en") return `${startName} → ${destinationName} · ${formattedDistance} · about ${minutes} min on foot`;
  if (language === "zh") return `${startName} → ${destinationName} · ${formattedDistance} · 步行约${minutes}分钟`;
  if (language === "ko") return `${startName} → ${destinationName} · ${formattedDistance} · 도보 약 ${minutes}분`;
  if (language === "pt") return `${startName} → ${destinationName} · ${formattedDistance} · cerca de ${minutes} min a pé`;
  if (language === "jaEasy") return `${startName} → ${destinationName}　${formattedDistance}　あるいて やく ${minutes}ふん`;
  return `${startName} → ${destinationName}　${formattedDistance}　徒歩約${minutes}分`;
}

function setRoutePlannerResult(message, isError = false) {
  const result = $("routePlannerResult");
  if (!result) return;
  result.textContent = message;
  result.classList.toggle("error", Boolean(isError));
}

function populateRoutePlanner() {
  const startSelect = $("routeStartSelect");
  const destinationSelect = $("routeDestinationSelect");
  if (!startSelect || !destinationSelect) return;

  const previousStart = startSelect.value || (state.routeStart?.temporary ? "current" : state.routeStart?.id) || "current";
  const previousDestination = destinationSelect.value || state.activeRoute?.destination?.id || state.selected?.id || "";
  const canUseCurrent = Boolean(state.userPosition);
  const currentInsideLocalArea = isInsideNavigationArea(state.userPosition);

  startSelect.textContent = "";
  const currentOption = document.createElement("option");
  currentOption.value = "current";
  currentOption.textContent = currentInsideLocalArea ? uiText("routeCurrent") : uiText("routeCurrentOutside");
  currentOption.disabled = !canUseCurrent;
  startSelect.append(currentOption);

  PLACES.forEach((place) => {
    const option = document.createElement("option");
    option.value = place.id;
    option.textContent = routePlaceOptionLabel(place);
    startSelect.append(option);
  });

  destinationSelect.textContent = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = uiText("routeChooseDestination");
  destinationSelect.append(placeholder);
  PLACES.forEach((place) => {
    const option = document.createElement("option");
    option.value = place.id;
    option.textContent = routePlaceOptionLabel(place);
    destinationSelect.append(option);
  });

  const startValues = [...startSelect.options].map((option) => option.value);
  startSelect.value = startValues.includes(previousStart) && !(previousStart === "current" && !canUseCurrent)
    ? previousStart
    : "saijo-station";
  destinationSelect.value = [...destinationSelect.options].some((option) => option.value === previousDestination)
    ? previousDestination
    : "";
}

function setRoutePlannerCompact(compact) {
  const button = $("routePlannerButton");
  if (!button) return;
  button.classList.toggle("route-active-compact", Boolean(compact));
  button.setAttribute("aria-label", compact ? "ルートを変更" : uiText("routePlannerOpen"));
}

function compactRoutePlannerAfterRoute() {
  const panel = $("routePlanner");
  if (panel?.classList.contains("open")) {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    $("routePlannerButton")?.setAttribute("aria-expanded", "false");
    state.routePlannerOpen = false;
  }
  setRoutePlannerCompact(true);
}

function openRoutePlanner() {
  setRoutePlannerCompact(false);
  const panel = $("routePlanner");
  if (!panel) return;
  closePlacesPanel();
  closeUdPanel?.();
  populateRoutePlanner();
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  $("routePlannerButton")?.setAttribute("aria-expanded", "true");
  state.routePlannerOpen = true;
  window.setTimeout(() => $("routeStartSelect")?.focus(), 210);
}

function closeRoutePlanner() {
  const panel = $("routePlanner");
  if (!panel) return;
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  $("routePlannerButton")?.setAttribute("aria-expanded", "false");
  state.routePlannerOpen = false;
  setRoutePlannerCompact(Boolean(state.activeRoute));
}

function plannerStartFromSelection() {
  const value = $("routeStartSelect")?.value;
  if (value === "current") {
    if (!state.userPosition) return null;
    return {
      id: "current-user-route-start",
      name: uiText("currentLocation"),
      coordinate: [state.userPosition.lng, state.userPosition.lat],
      temporary: true,
      outsideLocalArea: !isInsideNavigationArea(state.userPosition)
    };
  }
  const place = PLACES.find((item) => item.id === value);
  if (!place) return null;
  return {
    id: place.id,
    name: place.name,
    coordinate: [place.lng, place.lat],
    temporary: false
  };
}

function showPlannerRoute() {
  const start = plannerStartFromSelection();
  const destination = PLACES.find((place) => place.id === $("routeDestinationSelect")?.value);
  if (!start) {
    setRoutePlannerResult(uiText("routeCurrentOutsideHelp"), true);
    return;
  }
  if (!destination) {
    setRoutePlannerResult(uiText("routeChooseDestination"), true);
    return;
  }
  if (!start.temporary && start.id === destination.id) {
    setRoutePlannerResult(uiText("routeSamePlace"), true);
    return;
  }

  state.routeStart = start;
  state.selected = destination;
  const shown = drawRouteTo(destination, { fit: true });
  if (!shown) {
    setRoutePlannerResult(uiText("routeUnavailable"), true);
    return;
  }
  if (shown === "pending") {
    setRoutePlannerResult(`${destination.name}までの青い道を検索しています`, false);
    return;
  }
  setRoutePlannerResult(plannerMessage(start, destination, state.activeRoute.distance));
}

function swapPlannerRoute() {
  const startSelect = $("routeStartSelect");
  const destinationSelect = $("routeDestinationSelect");
  if (!startSelect || !destinationSelect || !destinationSelect.value) return;
  if (startSelect.value === "current") {
    setRoutePlannerResult(uiText("routeSwapCurrentHelp"), true);
    return;
  }
  const previousStart = startSelect.value;
  startSelect.value = destinationSelect.value;
  destinationSelect.value = previousStart;
  showPlannerRoute();
}

function syncRoutePlannerFromActiveRoute() {
  if (!$("routeStartSelect") || !$("routeDestinationSelect")) return;
  populateRoutePlanner();
  if (state.activeRoute) {
    $("routeStartSelect").value = state.activeRoute.start.temporary ? "current" : state.activeRoute.start.id;
    $("routeDestinationSelect").value = state.activeRoute.destination.id;
    const message = state.activeRoute.external
      ? externalRouteMessage(
          state.activeRoute.start,
          state.activeRoute.destination,
          state.activeRoute.distance,
          state.activeRoute.fallback
        )
      : plannerMessage(state.activeRoute.start, state.activeRoute.destination, state.activeRoute.distance);
    setRoutePlannerResult(message);
  } else if (state.routeStart) {
    $("routeStartSelect").value = state.routeStart.temporary ? "current" : state.routeStart.id;
    setRoutePlannerResult(uiText("routeSelectNext"));
  } else {
    setRoutePlannerResult(uiText("routePlannerInitial"));
  }
}

function validateAllFacilityRoutes() {
  const facilityIds = PLACES.map((place) => place.id);
  const failures = [];
  facilityIds.forEach((from) => {
    facilityIds.forEach((to) => {
      if (from === to) return;
      if (!shortestRoute(from, to)) failures.push(`${from}->${to}`);
    });
  });
  if (failures.length) console.error("Disconnected facility routes:", failures);
  return failures.length === 0;
}

function renderPlacesList() {
  const list = $("placesList");
  list.textContent = "";

  let spotHeadingAdded = false;
  PLACES.forEach((place) => {
    if (place.type === "spot" && !spotHeadingAdded) {
      const heading = document.createElement("h3");
      heading.className = "places-list-section-title";
      heading.textContent = "周辺スポット";
      list.append(heading);
      spotHeadingAdded = true;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "place-list-button";
    button.innerHTML = `
      <span class="list-number ${place.type}">${place.number}</span>
      <span class="list-copy">
        <strong>${place.name}</strong>
        <small>${placeTypeLabel(place)}</small>
      </span>
      <span class="list-arrow" aria-hidden="true">›</span>
    `;
    button.addEventListener("click", () => {
      closePlacesPanel();
      selectPlace(place);
    });
    list.append(button);
  });
}

function setControlCompact(buttonId, compact = true) {
  const button = $(buttonId);
  if (!button) return;
  button.classList.toggle("ui-action-compact", Boolean(compact));
}

function restoreControlForInteraction(buttonId) { setControlCompact(buttonId, false); }
function compactControlsAfterMapAction(...buttonIds) { buttonIds.filter(Boolean).forEach((id) => setControlCompact(id, true)); }

function openPlacesPanel() {
  restoreControlForInteraction("placesButton");
  const panel = $("placesPanel");
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  $("placesButton").setAttribute("aria-expanded", "true");
  window.setTimeout(() => panel.focus(), 260);
}

function closePlacesPanel() {
  const panel = $("placesPanel");
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  $("placesButton").setAttribute("aria-expanded", "false");
}

function updateDetailDistance() {
  if (!state.selected) return;
  if (!state.userPosition) {
    $("detailDistance").textContent = "未取得";
    return;
  }

  const distance = Math.round(metresBetween(state.userPosition, state.selected));
  $("detailDistance").textContent = distance >= 1000
    ? `${(distance / 1000).toFixed(1)} km`
    : `${distance} m`;
}

function focusSelectedPlace() {
  const place = state.selected;
  if (!place) return;
  state.followUser = false;
  $("locationButton").classList.remove("primary");
  state.map.easeTo({
    center: [place.lng, place.lat],
    zoom: place.type === "station" ? 17.95 : (place.type === "spot" ? 18.15 : 18.55),
    pitch: currentMapPitch(),
    bearing: preferredMapBearing(),
    offset: [0, place.type === "station" ? 145 : (place.type === "spot" ? 90 : 105)],
    duration: 720
  });
  setStatus(`${place.name}を表示しています`);
}

function selectPlace(place) {
  state.selected = place;

  state.markers.forEach((marker, id) => {
    marker.getElement().classList.toggle("selected", id === place.id);
  });

  const number = $("detailNumber");
  number.textContent = place.number;
  number.className = `detail-number ${place.type}`;
  $("detailType").textContent = placeTypeLabel(place);
  $("detailName").textContent = place.name;
  $("detailDescription").textContent = `${place.description} 所在地：${place.address}`;
  const detailImage = $("detailImage");
  if (place.image) {
    detailImage.src = place.image;
    detailImage.alt = `${place.name}の画像`;
    detailImage.hidden = false;
  } else {
    detailImage.hidden = true;
    detailImage.removeAttribute("src");
    detailImage.alt = "";
  }
  updateDetailDistance();
  $("detailCard").hidden = false;

  state.followUser = false;
  $("locationButton").classList.remove("primary");

  const routeShown = drawRouteTo(place, { fit: true });
  if (!routeShown) focusSelectedPlace();
  compactControlsAfterMapAction("placesButton");
}

function closeDetail() {
  $("detailCard").hidden = true;
  state.selected = null;
  state.markers.forEach((marker) => marker.getElement().classList.remove("selected"));
  stopOndokuAudio();
}

function showOverview(duration = 720) {
  restoreLocalRouteView();
  state.followUser = false;
  $("locationButton").classList.remove("primary");
  state.map.fitBounds(buildBounds(), {
    padding: overviewPadding(),
    maxZoom: 16.65,
    pitch: currentMapPitch(),
    bearing: preferredMapBearing(),
    offset: [-18, 22],
    duration
  });
  setStatus("進行方向を画面上に保ちながら、主要スポット全体を表示しています");
}

function userBottomCenterOffset() {
  /*
    現在地キャラクターを、画面中央ではなく下中央へ置くための縦方向オフセットです。
    端末の画面高に合わせて調整し、スマホでもPCでも下側に見えるようにします。
  */
  const container = state.map?.getContainer();
  const height = container?.clientHeight || window.innerHeight || 720;
  return Math.round(Math.max(150, Math.min(285, height * 0.29)));
}

function moveCameraWithUser(position, duration = 360, forceInitialZoom = true) {
  if (!state.ready || !position) return;

  const reducedMotion = prefersReducedMotion();
  state.map.easeTo({
    center: [position.lng, position.lat],
    zoom: forceInitialZoom ? INITIAL_FOLLOW_ZOOM : state.map.getZoom(),
    pitch: currentMapPitch(),
    bearing: Number.isFinite(position.heading) ? normalizeBearing(position.heading) : preferredMapBearing(),
    offset: [0, userBottomCenterOffset()],
    duration: reducedMotion ? 0 : duration,
    easing: (t) => t,
    essential: true
  });
}

function focusUser(duration = 520) {
  if (!state.userPosition) {
    $("locationButton").classList.remove("primary");
    startGps();
    return;
  }

  /* v29: エリア外でも全機能は使用可能。現在地ボタンだけカメラ追従を行わず、一時表示で知らせる。 */
  if (!isInsideNavigationArea(state.userPosition)) {
    $("locationButton").classList.remove("primary");
    state.followUser = false;
    showMapToast("エリア外です。地図の機能はそのまま使えます。", 2300);
    setStatus("現在地は表示範囲の外です。地図の機能は利用できます");
    return;
  }

  $("locationButton").classList.add("primary");
  restoreLocalRouteView();
  moveCameraWithUser(state.userPosition, duration);
  state.followUser = false;
  setStatus("現在地に戻りました");
}

function updateWalkingAnimation(nextPosition) {
  if (state.avatarWaitingForOpeningView) return;
  const element = state.userMarker?.getElement();
  if (!element || !state.previousPosition) return;

  const moved = metresBetween(state.previousPosition, nextPosition);
  element.classList.toggle("walking", moved > 1.1);

  window.clearTimeout(state.moveTimer);
  state.moveTimer = window.setTimeout(() => {
    element.classList.remove("walking");
  }, 1600);
}

function checkNearbyPlaces() {
  if (!state.userPosition || !("vibrate" in navigator)) return;

  PLACES.filter((place) => place.type === "brewery").forEach((place) => {
    const distance = metresBetween(state.userPosition, place);
    const isInside = distance <= 10;
    const wasInside = state.nearbyPlaceIds.has(place.id);

    if (isInside && !wasInside) {
      state.nearbyPlaceIds.add(place.id);
      navigator.vibrate(170);
      setStatus(`${place.name}の近くです`);
    } else if (!isInside && wasInside && distance > 14) {
      state.nearbyPlaceIds.delete(place.id);
    }
  });
}

function updateGps(position) {
  const previous = state.userPosition;
  const next = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: Math.max(5, Math.min(position.coords.accuracy || 12, 80)),
    heading: Number.isFinite(position.coords.heading)
      ? normalizeBearing(position.coords.heading)
      : null
  };
  if (!Number.isFinite(next.heading)) next.heading = deriveMovementHeading(previous, next);

  state.previousPosition = previous;
  state.userPosition = next;

  state.map.getSource("user-accuracy")?.setData(circleFeature(next, next.accuracy));

  if (!state.userMarker) {
    state.userMarker = new maplibregl.Marker({
      element: createUserMarker(),
      anchor: "bottom",
      pitchAlignment: "viewport",
      rotationAlignment: "viewport"
    })
      .setLngLat([next.lng, next.lat])
      .addTo(state.map);
  } else if (!state.avatarWaitingForOpeningView) {
    state.userMarker.setLngLat([next.lng, next.lat]);
  }

  updateUserPeek();
  updateAvatarFacing();

  updateUserHeadingArrow();
  if (Number.isFinite(next.heading)) {
    state.userMarker?.getElement().setAttribute(
      "aria-label",
      `現在地。進行方向は北から時計回りに${Math.round(next.heading)}度です`
    );
  } else {
    state.userMarker?.getElement().setAttribute("aria-label", "現在地");
  }
  keepUserHeadingAtTop(next);

  updateWalkingAnimation(next);
  updateDetailDistance();
  populateRoutePlanner();
  checkNearbyPlaces();
  $("permissionCard").hidden = true;

  const distanceFromArea = metresBetween(next, SAIJO_CENTER);
  if (state.firstFix) {
    /* 位置情報取得後も地図を自動移動させません。 */
    if (!state.initialViewLocked) captureInitialMapView(true);
    state.followUser = false;
    $("locationButton").classList.remove("primary");
  }

  /* GPSは自キャラと距離だけを更新し、カメラは動かしません。 */
  if (distanceFromArea > AREA_RADIUS_METERS) updateUserPeek();

  state.firstFix = false;
}

function gpsError(error) {
  let message = "ブラウザの位置情報を許可してください。";
  if (error?.code === 2) message = "現在地を取得できませんでした。屋外または窓の近くで再度お試しください。";
  if (error?.code === 3) message = "現在地の取得に時間がかかっています。もう一度お試しください。";

  $("permissionText").textContent = `${message} GPSはHTTPSまたはlocalhostで動作します。`;
  $("permissionCard").hidden = false;
  setStatus("現在地を取得できませんでした");
  updateUserPeek();
  if (!state.initialViewLocked) captureInitialMapView(true);
}

function startGps() {
  if (!state.ready) return;
  if (!("geolocation" in navigator)) {
    gpsError({ code: 0 });
    return;
  }

  setStatus("現在地を確認しています");
  $("permissionCard").hidden = true;

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
  }

  state.watchId = navigator.geolocation.watchPosition(
    updateGps,
    gpsError,
    {
      enableHighAccuracy: false,
      maximumAge: 10000,
      timeout: 15000
    }
  );
}

function stopOndokuAudio() {
  state.ondokuAudio.pause();
  state.ondokuAudio.currentTime = 0;
  state.isAudioLoading = false;
  if ($("speakButton")) $("speakButton").disabled = false;
}

async function playSelectedPlaceAudio() {
  if (!state.selected || state.isAudioLoading) return;

  const audioPath = ONDOKU_AUDIO_FILES[state.selected.id];
  if (!audioPath) {
    setStatus("この場所の音読さん音声が登録されていません");
    return;
  }

  stopOndokuAudio();
  state.isAudioLoading = true;
  $("speakButton").disabled = true;
  setStatus(`${state.selected.name}の音読さん音声を読み込んでいます`);

  try {
    state.ondokuAudio.src = audioPath;
    state.ondokuAudio.preload = "auto";
    state.ondokuAudio.volume = 1;
    await state.ondokuAudio.play();
    state.isAudioLoading = false;
    $("speakButton").disabled = false;
    setStatus(`${state.selected.name}を音声案内しています`);
  } catch (error) {
    console.warn("Ondoku audio playback failed:", error);
    state.isAudioLoading = false;
    $("speakButton").disabled = false;
    setStatus("この場所の音声はまだ用意されていません。");
  }
}

state.ondokuAudio.addEventListener("ended", () => {
  state.isAudioLoading = false;
  if ($("speakButton")) $("speakButton").disabled = false;
  setStatus("音声案内が終了しました");
});

state.ondokuAudio.addEventListener("error", () => {
  state.isAudioLoading = false;
  if ($("speakButton")) $("speakButton").disabled = false;
});

function bindUi() {
  $("locationButton").addEventListener("click", () => { focusUser(); compactControlsAfterMapAction("locationButton"); });
  $("overviewButton").addEventListener("click", () => { returnToOpeningView(); compactControlsAfterMapAction("overviewButton"); });
  $("stationButton").addEventListener("click", () => {
    const station = PLACES.find((place) => place.type === "station");
    if (station) selectPlace(station);
    compactControlsAfterMapAction("stationButton");
  });
  $("placesButton").addEventListener("click", () => {
    closeRoutePlanner();
    if ($("placesPanel").classList.contains("open")) closePlacesPanel();
    else openPlacesPanel();
  });
  $("routePlannerButton").addEventListener("click", () => {
    if ($("routePlanner").classList.contains("open")) closeRoutePlanner();
    else openRoutePlanner();
  });
  $("closeRoutePlannerButton").addEventListener("click", closeRoutePlanner);
  $("showPlannerRouteButton").addEventListener("click", showPlannerRoute);
  $("clearPlannerRouteButton").addEventListener("click", () => clearActiveRoute(true));
  $("swapRouteButton").addEventListener("click", swapPlannerRoute);
  $("routeDestinationSelect").addEventListener("change", () => {
    if ($("routeDestinationSelect").value) showPlannerRoute();
  });
  $("closePlacesButton").addEventListener("click", closePlacesPanel);
  $("closeDetailButton").addEventListener("click", closeDetail);
  $("retryGpsButton").addEventListener("click", startGps);
  $("focusPlaceButton").addEventListener("click", focusSelectedPlace);
  $("routeFromButton").addEventListener("click", setSelectedPlaceAsRouteStart);
  $("routeToButton").addEventListener("click", () => {
    if (state.selected) drawRouteTo(state.selected, { fit: true });
  });
  $("clearRouteButton").addEventListener("click", () => clearActiveRoute(true));
  $("speakButton").addEventListener("click", playSelectedPlaceAudio);
  $("stopSpeakButton").addEventListener("click", () => { stopOndokuAudio(); setStatus("音声案内を停止しました"); });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closePlacesPanel();
    closeRoutePlanner();
    closeDetail();
  });
}

function initialiseMap() {
  state.map = new maplibregl.Map({
    container: "map",
    style: MAP_STYLE,
    center: MAP_VIEW.center,
    zoom: MAP_VIEW.zoom,
    pitch: currentMapPitch(),
    bearing: MAP_VIEW.bearing,
    minZoom: LOCAL_MAP_MIN_ZOOM,
    maxZoom: 20,
    maxPitch: 82,
    antialias: false,
    fadeDuration: 100,
    attributionControl: true,
    dragPan: true,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    touchZoomRotate: true,
    scrollZoom: true,
    keyboard: true,
    renderWorldCopies: false,
    maxBounds: MAPLIBRE_VIEW_BOUNDS
  });

  /* 手動回転は無効。エリア内ではGPSの進行方向へ自動回転し、向いている方向を画面上に保ちます。 */
  state.map.touchZoomRotate.disableRotation();

  state.map.addControl(
    new maplibregl.NavigationControl({ showCompass: false, showZoom: false }),
    "bottom-right"
  );

  state.map.on("load", () => {
    customizeBaseStyle();
    addSceneryDepth();
    addWideRoads();
    addHighlightedBuildings();
    updateRouteBuildingReadability(true);
    addUserAccuracyLayers();
    addPlaceMarkers();
    /* 青い選択ルートは MapLibre 内でも必ず最後に追加して最上位へ。 */
    addActiveRouteLayers();
    ensureActiveRouteOnTop();
    updatePlaceMarkerMode();
    renderPlacesList();
    populateRoutePlanner();
    validateAllFacilityRoutes();

    state.ready = true;
    document.body.classList.remove("app-loading");
    document.body.classList.add("app-ready");
    updateUserPeek();
    state.map.setMaxBounds(MAPLIBRE_VIEW_BOUNDS);
    showOverview(0);
    captureInitialMapView(false);
    /* 起動時はカメラを固定したままGPSだけ取得します。 */
    state.followUser = false;
    startGps();
    applyUrlMapRequest();
  });

  state.map.on("dragstart", () => {
    cancelRouteCameraAnimation();
    /* 操作開始時にも必ず見えない境界を再適用する。 */
    state.map.setMaxBounds(MAPLIBRE_VIEW_BOUNDS);
    holdAvatarUntilOpeningView();
    setStatus("ドラッグ中です。酒蔵エリアの外へは進めません");
  });

  /*
    地図を拡大・縮小している間は、自キャラと画面下の頭を完全に透明にします。
    操作終了後も地図は勝手に戻しません。最初に開いた位置へ戻るまで男の子は透明のままです。
  */
  state.map.on("zoomstart", (event) => {
    if (event?.originalEvent) cancelRouteCameraAnimation();
    /* マウスホイール・ピンチ・ズームボタンなど、利用者が行ったズームだけを対象にします。 */
    if (!event?.originalEvent || state.isProgrammaticCamera || state.isIntroPlaying) return;
    state.userZoomGestureActive = true;

    /* GPS追跡を止め、男の子の画面上の位置も更新しません。 */
    holdAvatarUntilOpeningView();
    setAvatarZoomFade(true);
  });
  state.map.on("zoom", updateAvatarFacing);
  state.map.on("rotate", () => { updateAvatarFacing(); updateUserHeadingArrow(); });
  state.map.on("zoomend", () => {
    updatePlaceMarkerMode();
    updateAvatarFacing();
    if (!state.userZoomGestureActive) return;
    state.userZoomGestureActive = false;
    state.isZooming = false;
    syncAvatarTransparency();
    updateUserPeek();
    setStatus("地図の表示を調整しました。");
  });
  state.map.on("styledata", () => {
    if (state.activeRoute) requestAnimationFrame(refreshActiveRouteTopLayer);
  });
  /* 斜め表示・ズーム中も青ルートを最前面で道路に追従させます。 */
  state.map.on("render", () => {
    if (state.activeRoute) {
      renderActiveRouteTopCanvas();
      renderRouteAirGlow(performance.now());
    }
    updateRouteBuildingReadability();
  });

  state.map.on("move", syncAvatarTransparency);
  state.map.on("moveend", () => {
    enforceNavigationBounds();
    updateUserPeek();
    if (state.avatarWaitingForOpeningView && !state.isZooming) {
      requestAnimationFrame(() => {
        if (!releaseAvatarAtOpeningView()) syncAvatarTransparency();
      });
    }
  });

  state.map.on("resize", () => {
    updatePlaceMarkerMode();
    updateUserPeek();
  });

  /*
    maxBounds + enforceNavigationBounds により、ドラッグ・慣性移動・ルート表示でも
    酒蔵エリアの範囲外へカメラ中心は進めません。
    境界線や透明な壁は画面に描かず、外側の地図・緑・街並みは遠景としてそのまま続きます。
  */

  state.map.on("click", () => {
    closePlacesPanel();
  });

  state.map.on("error", (event) => {
    console.error("Map error:", event?.error || event);
  });
}


/* =========================================================
   Universal Design settings and multilingual interface
   ========================================================= */
const UD_SETTINGS_STORAGE_KEY = "saijo-ud-map-settings-v1";
const DEFAULT_UD_SETTINGS = {
  language: "ja",
  textSize: "normal",
  highContrast: false,
  reduceMotion: false,
  flatMap: false,
  hidePhotos: false,
  autoAudio: false
};

function loadUdSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(UD_SETTINGS_STORAGE_KEY) || "null");
    return { ...DEFAULT_UD_SETTINGS, ...(saved || {}) };
  } catch (error) {
    return { ...DEFAULT_UD_SETTINGS };
  }
}

let udSettings = loadUdSettings();

const UI_I18N = {
  ja: {
    appTitle: "西条 酒蔵めぐり", appSubtitle: "北を上に固定した公式MAPの位置関係",
    skipLink: "地図の操作へ移動", mapAria: "西条酒蔵通り。7つの酒蔵、くぐり門、JR西条駅を表示する地図",
    statusChecking: "現在地を確認しています", northUp: "北は画面の上", stationNorth: "↑ JR西条駅", breweriesSouth: "↓ 酒蔵通り・くぐり門", westEast: "← 山陽鶴　賀茂泉 →",
    currentLocation: "現在地", overview: "全体", saijoStation: "西条駅", places: "場所", routePlannerOpen: "ルート", udSettings: "設定",
    routePlannerKicker: "ルート", routePlannerTitle: "行き先を選ぶ", routePlannerClose: "閉じる", routePlannerHelp: "出発地と目的地を選ぶと、徒歩ルートを表示します。", routeOrigin: "出発地", routeDestination: "目的地", routeSwap: "出発地と目的地を入れ替える", routeShow: "青いルートを表示", routeCurrent: "現在地", routeCurrentOutside: "現在地（エリア外・全国対応）", routeChooseDestination: "目的地を選んでください", routeCurrentOutsideHelp: "位置情報を許可すると、エリア外からも青い道を表示できます。", routeSamePlace: "出発地と目的地が同じです。", routeUnavailable: "この組み合わせのルートを表示できません。", routeSwapCurrentHelp: "現在地は目的地へ入れ替えできません。施設を出発地に選んでください。", routeSelectNext: "目的地を選ぶと青い道を表示します。", routePlannerInitial: "出発地と目的地を選んでください。",
    areaNotice: "北が上です。西条駅と7酒蔵の範囲内だけドラッグできます", chooseDestination: "行き先を選ぶ", placesHeading: "酒蔵・くぐり門・西条駅",
    placesHelp: "行き先を選ぶと、場所の詳細を確認できます。", closePlaces: "場所一覧を閉じる", closeDetail: "詳細を閉じる",
    fromCurrent: "現在地から", routeSummaryDefault: "場所を選ぶと、どの地域からでも現在地から青い道を表示します", routeStartHere: "ここから出発", routeGuide: "青い道で案内", routeClear: "ルート消去",
    viewOnMap: "地図で見る", playAudio: "音声で説明を聞く", stopAudio: "音声を止める", voiceCredit: "音声読み上げ",
    locationUnavailable: "現在地を表示できません", permissionHelp: "現在地を表示するには、ブラウザで位置情報を許可してください。使えない場合は場所一覧から選べます。", retry: "もう一度試す",
    ready: "準備OK", exploreTitle: "西条の酒蔵を<br>探検しよう！", exploreCopy: "7つの酒蔵と、くぐり門をめぐろう",
    udPanelKicker: "設定", udPanelTitle: "設定", closeUd: "使いやすさ設定を閉じる", language: "表示言語", textSize: "文字の大きさ",
    textNormal: "標準", textLarge: "大きい", textXLarge: "特大", highContrast: "高コントラスト", highContrastHelp: "文字とボタンの境界を強くします",
    reduceMotion: "動きを減らす", reduceMotionHelp: "地図の動きを少なくします", flatMap: "真上から見る", flatMapHelp: "地図を真上から表示します",
    hidePhotos: "写真を減らす", hidePhotosHelp: "写真を減らして場所名を見やすくします", autoAudio: "場所を選ぶと音声で説明", autoAudioHelp: "対応する場所では説明音声を再生します",
    mapSummaryTitle: "地図の場所一覧", mapSummary: "JR西条駅は地図の北側です。酒蔵は駅の南側に東西へ並び、くぐり門は中央より東側にあります。",
    announceMap: "地図の説明を読み上げる", keyboardTitle: "キーボード操作", keyboardHelp: "Tabで項目を移動します。＋と－で拡大・縮小、Escでパネルを閉じます。",
    resetSettings: "設定を初期状態に戻す", routeLegend: "青い線と矢印が選択中の道です", brewery: "酒蔵", gate: "案内拠点", station: "交通拠点", address: "所在地",
    mapSummaryAnnounced: "地図の位置関係を読み上げソフトへ送りました", settingsSaved: "使いやすさ設定を変更しました", settingsReset: "使いやすさ設定を初期状態に戻しました"
  },
  jaEasy: {
    appTitle: "さいじょう おさけの まち", appSubtitle: "きたは いつも うえです", skipLink: "ちずの ボタンへ いく", mapAria: "さいじょうの おさけを つくる ばしょが 7つ ある ちず",
    statusChecking: "いま いる ばしょを しらべています", northUp: "きたは うえ", stationNorth: "↑ JRさいじょうえき", breweriesSouth: "↓ おさけの まち・くぐりもん", westEast: "← さんようつる　かもいずみ →",
    currentLocation: "いまいる所", overview: "ぜんぶ見る", saijoStation: "さいじょう駅", places: "ばしょ", routePlannerOpen: "みち", udSettings: "見やすさ",
    routePlannerKicker: "あるく みちを さがす", routePlannerTitle: "ばしょから ばしょへ あんない", routePlannerClose: "みちの けんさくを とじる", routePlannerHelp: "7つの さかぐら、くぐりもん、西条駅、ちかくの ばしょの あいだを あおい みちで あんないします。", routeOrigin: "でる ばしょ", routeDestination: "いく ばしょ", routeSwap: "でる ばしょと いく ばしょを いれかえる", routeShow: "あおい みちを だす", routeCurrent: "いまいる所", routeCurrentOutside: "いまいる所（どこからでも）", routeChooseDestination: "いく ばしょを えらんでください", routeCurrentOutsideHelp: "いち情報を ゆるすと、どこからでも あおい道を だせます。", routeSamePlace: "でる ばしょと いく ばしょが おなじです。", routeUnavailable: "この みちは だせません。", routeSwapCurrentHelp: "いまいる所は いれかえできません。", routeSelectNext: "いく ばしょを えらぶと あおい みちが でます。", routePlannerInitial: "でる ばしょと いく ばしょを えらんでください。", areaNotice: "きたが うえです。この ちずの なかだけ うごかせます",
    chooseDestination: "いく ばしょを えらぶ", placesHeading: "おさけの ばしょ・もん・えき", placesHelp: "ばんごうは 1から7です。", closePlaces: "ばしょを とじる", closeDetail: "せつめいを とじる",
    fromCurrent: "いまいる所から", routeSummaryDefault: "この まちの なかで ばしょを えらぶと、あおい みちが でます", routeStartHere: "ここから行く", routeGuide: "あおい道", routeClear: "道をけす",
    viewOnMap: "ちずで見る", playAudio: "音をきく", stopAudio: "音をとめる", voiceCredit: "音声読み上げ", locationUnavailable: "いまいる ばしょが わかりません", permissionHelp: "位置情報を ゆるしてください。", retry: "もう一ど",
    ready: "じゅんびOK", exploreTitle: "さいじょうの まちを<br>たんけんしよう！", exploreCopy: "7つの さかぐらと くぐりもんへ 行こう",
    udPanelKicker: "じぶんに あわせる", udPanelTitle: "見やすさの せってい", closeUd: "せっていを とじる", language: "ことば", textSize: "もじの おおきさ", textNormal: "ふつう", textLarge: "おおきい", textXLarge: "とても おおきい",
    highContrast: "くっきり表示", highContrastHelp: "もじと ボタンを はっきり させます", reduceMotion: "うごきを へらす", reduceMotionHelp: "のりものの うごきを だしません", flatMap: "うえからの ちず", flatMapHelp: "ななめの ちずを やめます",
    hidePhotos: "しゃしんを かくす", hidePhotosHelp: "ばんごうと なまえだけに します", autoAudio: "えらんだら 音を出す", autoAudioHelp: "日本語の 音声が ながれます",
    mapSummaryTitle: "ことばで ちずを しる", mapSummary: "JRさいじょうえきは きたに あります。7つの さかぐらは えきの みなみに ならんでいます。くぐりもんは まんなかより ひがしです。",
    announceMap: "ちずの せつめいを よむ", keyboardTitle: "キーボード", keyboardHelp: "Tabで ボタンを えらびます。＋と－で 大きさを かえます。0で ぜんぶを 見ます。",
    resetSettings: "もとの せっていに もどす", routeLegend: "あおい せんと やじるしが いく みちです", brewery: "おさけを つくる所", gate: "あんないの所", station: "えき", address: "ばしょ",
    mapSummaryAnnounced: "ちずの せつめいを よみました", settingsSaved: "せっていを かえました", settingsReset: "もとの せっていに もどしました"
  },
  en: {
    appTitle: "Saijo Sake Brewery Walk", appSubtitle: "North-up map based on the walking map", skipLink: "Skip to map controls", mapAria: "Map of seven sake breweries, Kuguri Gate and JR Saijo Station",
    statusChecking: "Checking your location", northUp: "North is at the top", stationNorth: "↑ JR Saijo Station", breweriesSouth: "↓ Brewery Street and Kuguri Gate", westEast: "← Sanyotsuru   Kamoizumi →",
    currentLocation: "My location", overview: "Overview", saijoStation: "Saijo Station", places: "Places", routePlannerOpen: "Routes", udSettings: "Accessibility",
    routePlannerKicker: "Walking route search", routePlannerTitle: "Plan a route between places", routePlannerClose: "Close route search", routePlannerHelp: "Show a blue walking route between the seven breweries, Kuguri Gate, JR Saijo Station and major nearby spots.", routeOrigin: "Start", routeDestination: "Destination", routeSwap: "Swap start and destination", routeShow: "Show blue route", routeCurrent: "Current location", routeCurrentOutside: "Current location (nationwide)", routeChooseDestination: "Choose a destination", routeCurrentOutsideHelp: "Allow location access to show a blue route from any area.", routeSamePlace: "The start and destination are the same.", routeUnavailable: "This route could not be displayed.", routeSwapCurrentHelp: "Current location cannot be swapped into the destination field.", routeSelectNext: "Choose a destination to display the blue route.", routePlannerInitial: "Choose a start and destination.", areaNotice: "North is up. The map can be dragged only within the station and brewery area.",
    chooseDestination: "Choose a destination", placesHeading: "Breweries, gate and station", placesHelp: "Brewery numbers match the walking map, 1 to 7.", closePlaces: "Close places", closeDetail: "Close details",
    fromCurrent: "From your location", routeSummaryDefault: "Select a place inside the brewery area to show a blue route from your location.", routeStartHere: "Start here", routeGuide: "Show blue route", routeClear: "Clear route",
    viewOnMap: "View on map", playAudio: "Play Japanese audio", stopAudio: "Stop audio", voiceCredit: "Audio: Ondoku-san", locationUnavailable: "Location unavailable", permissionHelp: "Allow location access. GPS requires HTTPS or localhost.", retry: "Try again",
    ready: "READY", exploreTitle: "Explore Saijo's<br>sake breweries!", exploreCopy: "Visit seven breweries and Kuguri Gate",
    udPanelKicker: "Personalise", udPanelTitle: "Accessibility settings", closeUd: "Close accessibility settings", language: "Language", textSize: "Text size", textNormal: "Standard", textLarge: "Large", textXLarge: "Extra large",
    highContrast: "High contrast", highContrastHelp: "Strengthen text and button borders", reduceMotion: "Reduce motion", reduceMotionHelp: "Skip vehicle and opening animations", flatMap: "Flat map", flatMapHelp: "Use a top-down view instead of a tilted view",
    hidePhotos: "Hide photos", hidePhotosHelp: "Show only numbers and names to reduce clutter", autoAudio: "Auto-play audio", autoAudioHelp: "Automatically play Japanese Ondoku MP3 audio",
    mapSummaryTitle: "Text map description", mapSummary: "JR Saijo Station is on the north side. The breweries are arranged east to west south of the station. Kuguri Gate is east of the centre.", announceMap: "Send map description to screen reader",
    keyboardTitle: "Keyboard controls", keyboardHelp: "Tab moves between controls, + and - zoom, 0 shows the overview, L goes to your location, U opens accessibility settings, and Esc closes panels.", resetSettings: "Reset settings", routeLegend: "The blue line and arrows show the selected route.",
    brewery: "Sake brewery", gate: "Visitor point", station: "Transport hub", address: "Address", mapSummaryAnnounced: "Map description sent to the screen reader", settingsSaved: "Accessibility settings updated", settingsReset: "Accessibility settings reset"
  },
  zh: {
    appTitle: "西条酒藏漫步", appSubtitle: "北向上，按照官方步行地图的位置关系", skipLink: "跳到地图操作", mapAria: "显示七家酒藏、穿门和JR西条站的地图", statusChecking: "正在确认当前位置",
    northUp: "北方在画面上方", stationNorth: "↑ JR西条站", breweriesSouth: "↓ 酒藏街・穿门", westEast: "← 山阳鹤　贺茂泉 →", currentLocation: "当前位置", overview: "全景", saijoStation: "西条站", places: "地点", routePlannerOpen: "路线", udSettings: "无障碍",
    routePlannerKicker: "步行路线搜索", routePlannerTitle: "地点之间的路线导航", routePlannerClose: "关闭路线搜索", routePlannerHelp: "可在七家酒藏、穿门、JR西条站和主要周边景点之间显示蓝色步行路线。", routeOrigin: "出发地", routeDestination: "目的地", routeSwap: "交换出发地和目的地", routeShow: "显示蓝色路线", routeCurrent: "当前位置", routeCurrentOutside: "当前位置（区域外也可用）", routeChooseDestination: "请选择目的地", routeCurrentOutsideHelp: "允许位置权限后，可以从任何区域显示蓝色路线。", routeSamePlace: "出发地和目的地相同。", routeUnavailable: "无法显示此路线。", routeSwapCurrentHelp: "当前位置不能交换为目的地。", routeSelectNext: "选择目的地后显示蓝色路线。", routePlannerInitial: "请选择出发地和目的地。",
    areaNotice: "北方朝上。地图只能在西条站和酒藏区域内拖动。", chooseDestination: "选择目的地", placesHeading: "酒藏・穿门・西条站", placesHelp: "编号与步行地图相同，为1至7。", closePlaces: "关闭地点列表", closeDetail: "关闭详情",
    fromCurrent: "从当前位置", routeSummaryDefault: "在酒藏区域内选择地点后，将显示蓝色路线。", routeStartHere: "从这里出发", routeGuide: "显示蓝色路线", routeClear: "清除路线", viewOnMap: "在地图上查看", playAudio: "播放日语语音", stopAudio: "停止语音", voiceCredit: "语音：Ondoku-san",
    locationUnavailable: "无法显示当前位置", permissionHelp: "请允许浏览器使用位置信息。GPS需要HTTPS或localhost。", retry: "重试", ready: "准备完成", exploreTitle: "一起探索<br>西条酒藏！", exploreCopy: "游览七家酒藏和穿门",
    udPanelKicker: "按需要调整", udPanelTitle: "无障碍设置", closeUd: "关闭无障碍设置", language: "显示语言", textSize: "文字大小", textNormal: "标准", textLarge: "大", textXLarge: "特大", highContrast: "高对比度", highContrastHelp: "加强文字和按钮边界",
    reduceMotion: "减少动画", reduceMotionHelp: "跳过交通工具和开场动画", flatMap: "平面地图", flatMapHelp: "改为从正上方查看", hidePhotos: "隐藏照片", hidePhotosHelp: "只显示编号和名称，减少拥挤", autoAudio: "选择时自动播放", autoAudioHelp: "自动播放日语MP3语音",
    mapSummaryTitle: "用文字了解地图", mapSummary: "JR西条站位于地图北侧。酒藏在车站南侧东西排列，穿门位于中央偏东。", announceMap: "发送地图说明给读屏软件", keyboardTitle: "键盘操作", keyboardHelp: "Tab切换按钮，＋和－缩放，0显示全景，L显示当前位置，U打开无障碍设置，Esc关闭面板。",
    resetSettings: "恢复默认设置", routeLegend: "蓝线和箭头表示所选路线。", brewery: "酒藏", gate: "游客服务点", station: "交通枢纽", address: "地址", mapSummaryAnnounced: "已将地图说明发送给读屏软件", settingsSaved: "无障碍设置已更新", settingsReset: "设置已恢复默认"
  },
  ko: {
    appTitle: "사이조 양조장 산책", appSubtitle: "북쪽이 위인 공식 도보 지도 배치", skipLink: "지도 조작으로 이동", mapAria: "7개 양조장, 구구리몬, JR 사이조역을 표시하는 지도", statusChecking: "현재 위치를 확인하고 있습니다",
    northUp: "북쪽은 화면 위", stationNorth: "↑ JR 사이조역", breweriesSouth: "↓ 양조장 거리・구구리몬", westEast: "← 산요쓰루　가모이즈미 →", currentLocation: "현재 위치", overview: "전체", saijoStation: "사이조역", places: "장소", routePlannerOpen: "경로", udSettings: "접근성",
    routePlannerKicker: "도보 경로 검색", routePlannerTitle: "장소 간 경로 안내", routePlannerClose: "경로 검색 닫기", routePlannerHelp: "7개 양조장, 구구리몬, JR 사이조역과 주요 주변 명소 사이의 파란 도보 경로를 표시합니다.", routeOrigin: "출발지", routeDestination: "목적지", routeSwap: "출발지와 목적지 바꾸기", routeShow: "파란 경로 표시", routeCurrent: "현재 위치", routeCurrentOutside: "현재 위치(구역 밖에서도 사용)", routeChooseDestination: "목적지를 선택하세요", routeCurrentOutsideHelp: "위치 권한을 허용하면 어느 지역에서나 파란 경로를 표시할 수 있습니다.", routeSamePlace: "출발지와 목적지가 같습니다.", routeUnavailable: "이 경로를 표시할 수 없습니다.", routeSwapCurrentHelp: "현재 위치는 목적지와 바꿀 수 없습니다.", routeSelectNext: "목적지를 선택하면 파란 경로가 표시됩니다.", routePlannerInitial: "출발지와 목적지를 선택하세요.",
    areaNotice: "북쪽이 위입니다. 역과 양조장 구역 안에서만 지도를 움직일 수 있습니다.", chooseDestination: "목적지 선택", placesHeading: "양조장・구구리몬・사이조역", placesHelp: "번호는 도보 지도와 같은 1~7입니다.", closePlaces: "장소 목록 닫기", closeDetail: "상세 닫기",
    fromCurrent: "현재 위치에서", routeSummaryDefault: "양조장 구역 안에서 장소를 선택하면 파란 경로가 표시됩니다.", routeStartHere: "여기서 출발", routeGuide: "파란 경로", routeClear: "경로 지우기", viewOnMap: "지도에서 보기", playAudio: "일본어 음성 재생", stopAudio: "음성 정지", voiceCredit: "음성: Ondoku-san",
    locationUnavailable: "현재 위치를 표시할 수 없습니다", permissionHelp: "브라우저의 위치 권한을 허용해 주세요. GPS는 HTTPS 또는 localhost에서 작동합니다.", retry: "다시 시도", ready: "준비 완료", exploreTitle: "사이조 양조장을<br>탐험해요!", exploreCopy: "7개 양조장과 구구리몬을 둘러보세요",
    udPanelKicker: "나에게 맞추기", udPanelTitle: "접근성 설정", closeUd: "접근성 설정 닫기", language: "표시 언어", textSize: "글자 크기", textNormal: "표준", textLarge: "크게", textXLarge: "아주 크게", highContrast: "고대비", highContrastHelp: "글자와 버튼 경계를 선명하게 합니다",
    reduceMotion: "움직임 줄이기", reduceMotionHelp: "교통수단과 시작 애니메이션을 생략합니다", flatMap: "평면 지도", flatMapHelp: "기울어진 지도를 위에서 보는 지도로 바꿉니다", hidePhotos: "사진 숨기기", hidePhotosHelp: "번호와 이름만 표시해 겹침을 줄입니다", autoAudio: "선택 시 음성 재생", autoAudioHelp: "일본어 MP3를 자동 재생합니다",
    mapSummaryTitle: "글로 지도 확인", mapSummary: "JR 사이조역은 지도 북쪽에 있습니다. 양조장은 역 남쪽에 동서로 이어지고, 구구리몬은 중앙보다 동쪽에 있습니다.", announceMap: "스크린 리더에 지도 설명 보내기", keyboardTitle: "키보드 조작", keyboardHelp: "Tab으로 이동, +와 -로 확대/축소, 0은 전체, L은 현재 위치, U는 접근성 설정, Esc는 패널 닫기입니다.",
    resetSettings: "설정 초기화", routeLegend: "파란 선과 화살표가 선택한 경로입니다.", brewery: "양조장", gate: "안내 거점", station: "교통 거점", address: "주소", mapSummaryAnnounced: "지도 설명을 스크린 리더로 보냈습니다", settingsSaved: "접근성 설정을 변경했습니다", settingsReset: "설정을 초기화했습니다"
  },
  pt: {
    appTitle: "Passeio pelas saqueterias de Saijo", appSubtitle: "Mapa com o norte para cima, baseado no mapa oficial", skipLink: "Ir para os controles do mapa", mapAria: "Mapa com sete saqueterias, o portão Kuguri e a estação JR Saijo", statusChecking: "Verificando sua localização",
    northUp: "O norte fica no topo", stationNorth: "↑ Estação JR Saijo", breweriesSouth: "↓ Rua das saqueterias e Portão Kuguri", westEast: "← Sanyotsuru   Kamoizumi →", currentLocation: "Minha localização", overview: "Visão geral", saijoStation: "Estação Saijo", places: "Locais", routePlannerOpen: "Rotas", udSettings: "Acessibilidade",
    routePlannerKicker: "Busca de rota a pé", routePlannerTitle: "Rota entre locais", routePlannerClose: "Fechar busca de rota", routePlannerHelp: "Mostra uma rota azul entre as sete saqueterias, o Portão Kuguri, a Estação JR Saijo e os principais pontos próximos.", routeOrigin: "Partida", routeDestination: "Destino", routeSwap: "Trocar partida e destino", routeShow: "Mostrar rota azul", routeCurrent: "Localização atual", routeCurrentOutside: "Localização atual (qualquer região)", routeChooseDestination: "Escolha um destino", routeCurrentOutsideHelp: "Permita a localização para mostrar uma rota azul a partir de qualquer região.", routeSamePlace: "A partida e o destino são iguais.", routeUnavailable: "Não foi possível mostrar esta rota.", routeSwapCurrentHelp: "A localização atual não pode ser trocada para o destino.", routeSelectNext: "Escolha um destino para mostrar a rota azul.", routePlannerInitial: "Escolha a partida e o destino.",
    areaNotice: "O norte fica para cima. O mapa só pode ser arrastado dentro da área da estação e das saqueterias.", chooseDestination: "Escolha o destino", placesHeading: "Saqueterias, portão e estação", placesHelp: "Os números são os mesmos do mapa de caminhada, de 1 a 7.", closePlaces: "Fechar locais", closeDetail: "Fechar detalhes",
    fromCurrent: "Da sua localização", routeSummaryDefault: "Escolha um local dentro da área para mostrar a rota azul.", routeStartHere: "Partir daqui", routeGuide: "Mostrar rota azul", routeClear: "Limpar rota", viewOnMap: "Ver no mapa", playAudio: "Ouvir áudio em japonês", stopAudio: "Parar áudio", voiceCredit: "Áudio: Ondoku-san",
    locationUnavailable: "Localização indisponível", permissionHelp: "Permita o acesso à localização. O GPS requer HTTPS ou localhost.", retry: "Tentar novamente", ready: "PRONTO", exploreTitle: "Vamos explorar as<br>saqueterias de Saijo!", exploreCopy: "Visite sete saqueterias e o Portão Kuguri",
    udPanelKicker: "Personalizar", udPanelTitle: "Configurações de acessibilidade", closeUd: "Fechar configurações", language: "Idioma", textSize: "Tamanho do texto", textNormal: "Padrão", textLarge: "Grande", textXLarge: "Extra grande", highContrast: "Alto contraste", highContrastHelp: "Reforça os limites de textos e botões",
    reduceMotion: "Reduzir movimento", reduceMotionHelp: "Pula animações de veículos e abertura", flatMap: "Mapa plano", flatMapHelp: "Mostra o mapa de cima, sem inclinação", hidePhotos: "Ocultar fotos", hidePhotosHelp: "Mostra apenas números e nomes para reduzir a sobreposição", autoAudio: "Reproduzir áudio ao selecionar", autoAudioHelp: "Reproduz automaticamente o MP3 japonês",
    mapSummaryTitle: "Descrição textual do mapa", mapSummary: "A estação JR Saijo fica ao norte. As saqueterias ficam ao sul da estação, de leste a oeste. O Portão Kuguri fica a leste do centro.", announceMap: "Enviar descrição ao leitor de tela", keyboardTitle: "Controles do teclado", keyboardHelp: "Tab navega, + e - ajustam o zoom, 0 mostra tudo, L mostra sua localização, U abre acessibilidade e Esc fecha painéis.",
    resetSettings: "Restaurar configurações", routeLegend: "A linha azul e as setas mostram a rota selecionada.", brewery: "Saqueteria", gate: "Ponto de visitantes", station: "Centro de transporte", address: "Endereço", mapSummaryAnnounced: "Descrição do mapa enviada ao leitor de tela", settingsSaved: "Configurações de acessibilidade atualizadas", settingsReset: "Configurações restauradas"
  }
};

const PLACE_I18N = {
  en: {
    sanyotsuru: ["Sanyotsuru Sake Brewery", "Brewery No. 1 on the walking map, southwest of Saijo Station."],
    hakubotan: ["Hakubotan Sake Brewery", "Brewery No. 2, a historic brewery on the south side of Brewery Street."],
    saijotsuru: ["Saijotsuru Sake Brewery", "Brewery No. 3, located between Kamotsuru and Kirei."],
    kamotsuru: ["Kamotsuru Sake Brewery", "Brewery No. 4. The direct shop at Brewery No. 1 is used as the map landmark."],
    kirei: ["Kirei Sake Brewery", "Brewery No. 5, east of Saijotsuru."],
    fukubijin: ["Fukubijin Sake Brewery", "Brewery No. 6, on the northeast side of the brewery area."],
    kamoizumi: ["Kamoizumi Sake Brewery", "Brewery No. 7, east of Kuguri Gate."],
    kugurimon: ["Kuguri Gate", "A visitor information point and landmark for walking around Brewery Street."],
    "saijo-station": ["JR Saijo Station", "The main gateway to Brewery Street."]
  },
  zh: {
    sanyotsuru: ["山阳鹤酒造", "步行地图1号，位于西条站西南侧。"], hakubotan: ["白牡丹酒造", "步行地图2号，位于酒藏街南侧的历史酒藏。"],
    saijotsuru: ["西条鹤酿造", "步行地图3号，位于贺茂鹤与龟龄之间。"], kamotsuru: ["贺茂鹤酒造", "步行地图4号，以一号藏直营店为地图标志。"],
    kirei: ["龟龄酒造", "步行地图5号，位于西条鹤东侧。"], fukubijin: ["福美人酒造", "步行地图6号，位于酒藏区域东北侧。"],
    kamoizumi: ["贺茂泉酒造", "步行地图7号，位于穿门东侧。"], kugurimon: ["穿门", "酒藏街的游客服务点和步行地标。"], "saijo-station": ["JR西条站", "前往酒藏街的主要入口。"]
  },
  ko: {
    sanyotsuru: ["산요쓰루 주조", "도보 지도 1번으로 사이조역 남서쪽에 있습니다."], hakubotan: ["하쿠보탄 주조", "도보 지도 2번으로 양조장 거리 남쪽의 역사적인 양조장입니다."],
    saijotsuru: ["사이조쓰루 양조", "도보 지도 3번으로 가모쓰루와 기레이 사이에 있습니다."], kamotsuru: ["가모쓰루 주조", "도보 지도 4번이며 1호 양조장 직영점을 표식으로 표시합니다."],
    kirei: ["기레이 주조", "도보 지도 5번으로 사이조쓰루 동쪽에 있습니다."], fukubijin: ["후쿠비진 주조", "도보 지도 6번으로 양조장 구역 북동쪽에 있습니다."],
    kamoizumi: ["가모이즈미 주조", "도보 지도 7번으로 구구리몬 동쪽에 있습니다."], kugurimon: ["구구리몬", "양조장 거리 관광 안내와 산책의 기준점입니다."], "saijo-station": ["JR 사이조역", "양조장 거리의 관문입니다."]
  },
  pt: {
    sanyotsuru: ["Saqueteria Sanyotsuru", "Local nº 1 do mapa, a sudoeste da estação Saijo."], hakubotan: ["Saqueteria Hakubotan", "Local nº 2, uma saqueteria histórica ao sul da rua."],
    saijotsuru: ["Saqueteria Saijotsuru", "Local nº 3, entre Kamotsuru e Kirei."], kamotsuru: ["Saqueteria Kamotsuru", "Local nº 4; a loja direta da primeira adega é o ponto de referência."],
    kirei: ["Saqueteria Kirei", "Local nº 5, a leste de Saijotsuru."], fukubijin: ["Saqueteria Fukubijin", "Local nº 6, no nordeste da área."],
    kamoizumi: ["Saqueteria Kamoizumi", "Local nº 7, a leste do Portão Kuguri."], kugurimon: ["Portão Kuguri", "Ponto de informações e referência do passeio."], "saijo-station": ["Estação JR Saijo", "Principal entrada para a rua das saqueterias."]
  },
  jaEasy: {
    sanyotsuru: ["山陽鶴酒造", "1ばん。さいじょう駅の みなみ西に あります。"], hakubotan: ["白牡丹酒造", "2ばん。おさけの まちの みなみです。"],
    saijotsuru: ["西條鶴醸造", "3ばん。賀茂鶴と 亀齢の あいだです。"], kamotsuru: ["賀茂鶴酒造", "4ばん。1ごうぐらの お店が めじるしです。"],
    kirei: ["亀齢酒造", "5ばん。西條鶴の ひがしです。"], fukubijin: ["福美人酒造", "6ばん。おさけの まちの きた東です。"],
    kamoizumi: ["賀茂泉酒造", "7ばん。くぐりもんの ひがしです。"], kugurimon: ["くぐり門", "かんこうの あんないを きく ことが できます。"], "saijo-station": ["JR西条駅", "おさけの まちへ 行く ときの えきです。"]
  }
};

function uiText(key) {
  const table = UI_I18N[udSettings.language] || UI_I18N.ja;
  return table[key] ?? UI_I18N.ja[key] ?? key;
}

function localizedPlace(place) {
  const translated = PLACE_I18N[udSettings.language]?.[place.id];
  return {
    ...place,
    localizedName: translated?.[0] || place.name,
    localizedDescription: translated?.[1] || place.description
  };
}

function localeCode() {
  return ({ ja: "ja", jaEasy: "ja", en: "en", zh: "zh-CN", ko: "ko", pt: "pt-BR" })[udSettings.language] || "ja";
}

function prefersReducedMotion() {
  return Boolean(udSettings.reduceMotion || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

function currentMapPitch() {
  return udSettings.flatMap ? 0 : CAMERA_PITCH;
}

function saveUdSettings() {
  try { localStorage.setItem(UD_SETTINGS_STORAGE_KEY, JSON.stringify(udSettings)); } catch (error) {}
}

function announce(message) {
  const live = $("screenReaderStatus");
  if (!live) return;
  live.textContent = "";
  window.setTimeout(() => { live.textContent = message; }, 30);
}

function replacePlaceNames(message) {
  let result = String(message || "");
  PLACES.forEach((place) => {
    result = result.split(place.name).join(localizedPlace(place).localizedName);
  });
  return result;
}

function translateRuntimeMessage(message) {
  const language = udSettings.language;
  if (language === "ja") return message;
  const exact = {
    jaEasy: {
      "現在地を確認しています": "いま いる ばしょを しらべています",
      "現在地を取得できませんでした": "いま いる ばしょが わかりません",
      "現在地は酒蔵エリアの外です": "いまは おさけの まちの そとです",
      "青い案内ルートを消しました": "あおい みちを けしました",
      "音声案内が終了しました": "おとの あんないが おわりました"
    },
    en: {
      "現在地を確認しています": "Checking your location",
      "現在地を取得できませんでした": "Could not get your location",
      "現在地は酒蔵エリアの外です": "You are outside the brewery area",
      "青い案内ルートを消しました": "The blue route has been cleared",
      "音声案内が終了しました": "Audio guide finished",
      "探索スタート。7つの酒蔵とくぐり門をめぐりましょう": "Exploration started. Visit the seven breweries and Kuguri Gate."
    },
    zh: {
      "現在地を確認しています": "正在确认当前位置", "現在地を取得できませんでした": "无法获取当前位置", "現在地は酒蔵エリアの外です": "您位于酒藏区域外", "青い案内ルートを消しました": "已清除蓝色路线", "音声案内が終了しました": "语音导览已结束"
    },
    ko: {
      "現在地を確認しています": "현재 위치를 확인하고 있습니다", "現在地を取得できませんでした": "현재 위치를 가져올 수 없습니다", "現在地は酒蔵エリアの外です": "현재 양조장 구역 밖에 있습니다", "青い案内ルートを消しました": "파란 경로를 지웠습니다", "音声案内が終了しました": "음성 안내가 끝났습니다"
    },
    pt: {
      "現在地を確認しています": "Verificando sua localização", "現在地を取得できませんでした": "Não foi possível obter sua localização", "現在地は酒蔵エリアの外です": "Você está fora da área das saqueterias", "青い案内ルートを消しました": "A rota azul foi apagada", "音声案内が終了しました": "O guia de áudio terminou"
    }
  };
  if (exact[language]?.[message]) return exact[language][message];
  let result = replacePlaceNames(message);
  const tails = {
    en: [[/を表示しています$/, " is shown on the map"], [/の近くです$/, " is nearby"], [/までの道を青色で表示しています$/, " route is shown in blue"], [/を出発地に設定しました$/, " is set as the starting point"]],
    zh: [[/を表示しています$/, "已显示在地图上"], [/の近くです$/, "就在附近"], [/までの道を青色で表示しています$/, "的路线已用蓝色显示"], [/を出発地に設定しました$/, "已设为出发点"]],
    ko: [[/を表示しています$/, "을(를) 지도에 표시합니다"], [/の近くです$/, " 근처입니다"], [/までの道を青色で表示しています$/, "까지의 길을 파란색으로 표시합니다"], [/を出発地に設定しました$/, "을(를) 출발지로 설정했습니다"]],
    pt: [[/を表示しています$/, " está sendo mostrado no mapa"], [/の近くです$/, " está perto"], [/までの道を青色で表示しています$/, " tem a rota mostrada em azul"], [/を出発地に設定しました$/, " foi definido como ponto de partida"]]
  };
  (tails[language] || []).some(([pattern, tail]) => {
    if (!pattern.test(result)) return false;
    result = result.replace(pattern, tail);
    return true;
  });
  return result;
}

function applyTranslations() {
  document.documentElement.lang = localeCode();
  document.title = `${uiText("appTitle")} | UD Map`;

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (key === "voiceCredit") {
      element.innerHTML = `${uiText(key).replace("音読さん", "").replace("Ondoku-san", "")}<a href="https://ondoku3.com/ja/" target="_blank" rel="noopener noreferrer">Ondoku-san</a>`;
    } else if (key === "exploreTitle") {
      element.innerHTML = uiText(key);
    } else {
      element.textContent = uiText(key);
    }
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
    element.setAttribute("aria-label", uiText(element.dataset.i18nAria));
  });
  document.querySelectorAll("[data-i18n-button]").forEach((button) => {
    const icon = button.querySelector("[aria-hidden='true']")?.outerHTML || "";
    button.innerHTML = `${icon} ${uiText(button.dataset.i18nButton)}`;
  });

  if (state.ready) {
    renderPlacesList();
    updateMarkerTranslations();
    populateRoutePlanner();
  }
  if (state.selected) refreshSelectedDetailLanguage();
  refreshRouteSummaryLanguage();
  syncRoutePlannerFromActiveRoute();
}

function updateMarkerTranslations() {
  state.markers.forEach((marker, id) => {
    const place = PLACES.find((item) => item.id === id);
    if (!place) return;
    const local = localizedPlace(place);
    const element = marker.getElement();
    element.setAttribute("aria-label", `${local.localizedName}. ${uiText("viewOnMap")}`);
    element.querySelectorAll(".overview-building-name,.station-picture-label,.marker-label").forEach((node) => { node.textContent = local.localizedName; });
  });
}

function refreshSelectedDetailLanguage() {
  if (!state.selected) return;
  const local = localizedPlace(state.selected);
  $("detailType").textContent = placeTypeLabel(state.selected);
  $("detailName").textContent = local.localizedName;
  $("detailDescription").textContent = `${local.localizedDescription} ${uiText("address")}：${state.selected.address}`;
  const image = $("detailImage");
  if (image && !image.hidden) image.alt = `${local.localizedName}`;
}

function refreshRouteSummaryLanguage() {
  const summary = $("routeSummary");
  if (!summary) return;
  if (state.activeRoute) {
    const startName = state.activeRoute.start.temporary
      ? uiText("currentLocation")
      : localizedPlace(PLACES.find((item) => item.id === state.activeRoute.start.id) || state.activeRoute.start).localizedName;
    const destinationName = localizedPlace(state.activeRoute.destination).localizedName;
    summary.textContent = `${startName} → ${destinationName}　${formatRouteDistance(state.activeRoute.distance)}`;
  } else if (state.routeStart && !state.routeStart.temporary) {
    const place = PLACES.find((item) => item.id === state.routeStart.id);
    summary.textContent = `${uiText("routeStartHere")}：${place ? localizedPlace(place).localizedName : state.routeStart.name}`;
  } else {
    summary.textContent = uiText("routeSummaryDefault");
  }
}

function updateTextSizeButtons() {
  document.querySelectorAll("[data-text-size]").forEach((button) => {
    const active = button.dataset.textSize === udSettings.textSize;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function applyUdSettings({ persist = false, moveMap = true } = {}) {
  document.body.classList.toggle("ud-text-large", udSettings.textSize === "large");
  document.body.classList.toggle("ud-text-xlarge", udSettings.textSize === "xlarge");
  document.body.classList.toggle("ud-high-contrast", udSettings.highContrast);
  document.body.classList.toggle("ud-reduced-motion", prefersReducedMotion());
  document.body.classList.toggle("ud-flat-map", udSettings.flatMap);
  document.body.classList.toggle("ud-photos-hidden", udSettings.hidePhotos);

  const values = {
    languageSelect: udSettings.language,
    highContrastToggle: udSettings.highContrast,
    reduceMotionToggle: udSettings.reduceMotion,
    flatMapToggle: udSettings.flatMap,
    hidePhotosToggle: udSettings.hidePhotos,
    autoAudioToggle: udSettings.autoAudio
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = $(id);
    if (!element) return;
    if (element.type === "checkbox") element.checked = Boolean(value);
    else element.value = value;
  });
  updateTextSizeButtons();
  applyTranslations();

  if (state.ready && moveMap) {
    state.isProgrammaticCamera = true;
    state.map.easeTo({ pitch: currentMapPitch(), bearing: preferredMapBearing(), duration: prefersReducedMotion() ? 0 : 420, essential: true });
    state.map.once("moveend", () => { state.isProgrammaticCamera = false; });
    updatePlaceMarkerMode();
  }
  if (persist) saveUdSettings();
}

function openUdPanel() {
  restoreControlForInteraction("udButton");
  closePlacesPanel();
  closeRoutePlanner();
  const panel = $("udPanel");
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  $("udButton").setAttribute("aria-expanded", "true");
  window.setTimeout(() => panel.focus(), 150);
}

function closeUdPanel() {
  const panel = $("udPanel");
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  $("udButton").setAttribute("aria-expanded", "false");
  compactControlsAfterMapAction("udButton");
}

function announceMapSummary() {
  const summary = uiText("mapSummary");
  announce(summary);
  setStatus(uiText("mapSummaryAnnounced"));
}

function resetUdSettings() {
  udSettings = { ...DEFAULT_UD_SETTINGS };
  applyUdSettings({ persist: true, moveMap: true });
  announce(uiText("settingsReset"));
  setStatus(uiText("settingsReset"));
}

function updateSetting(name, value) {
  udSettings = { ...udSettings, [name]: value };
  applyUdSettings({ persist: true, moveMap: name === "flatMap" });
  announce(uiText("settingsSaved"));
  window.clearTimeout(state.udAutoCloseTimer);
  state.udAutoCloseTimer = window.setTimeout(() => {
    if ($("udPanel")?.classList.contains("open")) closeUdPanel();
  }, 720);
}

function bindUniversalDesignUi() {
  applyUdSettings({ persist: false, moveMap: false });
  $("udButton")?.addEventListener("click", () => {
    if ($("udPanel").classList.contains("open")) closeUdPanel();
    else openUdPanel();
  });
  $("closeUdButton")?.addEventListener("click", closeUdPanel);
  $("languageSelect")?.addEventListener("change", (event) => updateSetting("language", event.target.value));
  document.querySelectorAll("[data-text-size]").forEach((button) => button.addEventListener("click", () => updateSetting("textSize", button.dataset.textSize)));
  for (const [id, key] of [["highContrastToggle","highContrast"],["reduceMotionToggle","reduceMotion"],["flatMapToggle","flatMap"],["hidePhotosToggle","hidePhotos"],["autoAudioToggle","autoAudio"]]) {
    $(id)?.addEventListener("change", (event) => updateSetting(key, event.target.checked));
  }
  $("announceMapButton")?.addEventListener("click", announceMapSummary);
  $("resetUdButton")?.addEventListener("click", resetUdSettings);

  document.addEventListener("keydown", (event) => {
    const tag = event.target?.tagName?.toLowerCase();
    if (["input","select","textarea"].includes(tag)) return;
    if (event.key === "Escape") { closeUdPanel(); return; }
    if (event.key === "u" || event.key === "U") { event.preventDefault(); openUdPanel(); return; }
    if (!state.ready) return;
    if (event.key === "+" || event.key === "=") { event.preventDefault(); state.map.zoomIn({ duration: prefersReducedMotion() ? 0 : 300 }); }
    if (event.key === "-") { event.preventDefault(); state.map.zoomOut({ duration: prefersReducedMotion() ? 0 : 300 }); }
    if (event.key === "0") { event.preventDefault(); returnToOpeningView(); }
    if (event.key === "l" || event.key === "L") { event.preventDefault(); focusUser(); }
  });
}

/* Wrap existing map functions so language changes also affect markers, details and status messages. */
const originalSetStatusForUd = setStatus;
setStatus = function universalSetStatus(message) {
  if (!message || message === state.lastStatusMessage) return;
  state.lastStatusMessage = message;
  originalSetStatusForUd(message);
};

const originalPlaceTypeLabelForUd = placeTypeLabel;
placeTypeLabel = function universalPlaceTypeLabel(place) {
  if (place.type === "station") return uiText("station");
  if (place.type === "gate") return uiText("gate");
  if (place.type === "spot") {
    return ({ en: "Nearby spot", zh: "周边景点", ko: "주변 명소", pt: "Ponto próximo", jaEasy: "ちかくの ばしょ" })[udSettings.language] || "周辺スポット";
  }
  return uiText("brewery");
};

const originalCreatePlaceMarkerForUd = createPlaceMarker;
createPlaceMarker = function universalCreatePlaceMarker(place) {
  const button = originalCreatePlaceMarkerForUd(place);
  const local = localizedPlace(place);
  button.setAttribute("aria-label", `${local.localizedName}. ${uiText("viewOnMap")}`);
  button.querySelectorAll(".overview-building-name,.station-picture-label,.marker-label").forEach((node) => { node.textContent = local.localizedName; });
  return button;
};

const originalRenderPlacesListForUd = renderPlacesList;
renderPlacesList = function universalRenderPlacesList() {
  originalRenderPlacesListForUd();
  document.querySelectorAll("#placesList .place-list-button").forEach((button, index) => {
    const place = PLACES[index];
    if (!place) return;
    const local = localizedPlace(place);
    const name = button.querySelector("strong");
    const type = button.querySelector("small");
    if (name) name.textContent = local.localizedName;
    if (type) type.textContent = placeTypeLabel(place);
    button.setAttribute("aria-label", `${local.localizedName}. ${placeTypeLabel(place)}`);
  });
};

const originalSelectPlaceForUd = selectPlace;
selectPlace = function universalSelectPlace(place) {
  originalSelectPlaceForUd(place);
  refreshSelectedDetailLanguage();
  const translatedSummary = translateRuntimeMessage($("routeSummary")?.textContent || "");
  if ($("routeSummary")) $("routeSummary").textContent = translatedSummary;
  if (udSettings.autoAudio) window.setTimeout(() => playSelectedPlaceAudio(), 80);
};

const originalDrawRouteToForUd = drawRouteTo;
drawRouteTo = function universalDrawRouteTo(place, options) {
  const result = originalDrawRouteToForUd(place, options);
  if ($("routeSummary")) $("routeSummary").textContent = translateRuntimeMessage($("routeSummary").textContent);
  return result;
};


bindUi();
bindUniversalDesignUi();
function applyUrlMapRequest() {
  const params = new URLSearchParams(window.location.search);
  const placeId = params.get("place");
  const fromId = params.get("from");
  const toId = params.get("to");

  window.setTimeout(() => {
    if (fromId && toId && PLACES.some((place) => place.id === fromId) && PLACES.some((place) => place.id === toId)) {
      openRoutePlanner();
      $("routeStartSelect").value = fromId;
      $("routeDestinationSelect").value = toId;
      showPlannerRoute();
      return;
    }
    if (placeId) {
      const place = PLACES.find((item) => item.id === placeId);
      if (place) selectPlace(place);
    }
  }, 650);
}

initialiseMap();
