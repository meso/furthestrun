import { world, system, Player, EntityHealthComponent, TicksPerSecond, DisplaySlotId, ObjectiveSortOrder, Vector3 } from "@minecraft/server";

let gameStarted = false;
let gameStartTimer = 0;
let gameTimer = 0;
let spawnPoint = { x: 0, y: 100, z: 0};
const gameStartCountdown = 10; // ゲーム開始までのカウントダウン秒数
const gameDuration = 5 * 60; // 10分

// ゲームスタート
function startGame(startPoint: Vector3) {
  gameStarted = false;
  gameStartTimer = gameStartCountdown;
  gameTimer = gameDuration;
  spawnPoint = startPoint;
  try {
    world.scoreboard.removeObjective("distance");
  } catch(err) {
    // スコアボードが存在しない場合はエラーになるため、無視
  }
  createBarrierCage();

  // 全プレイヤーをスタート地点にテレポート
  for (const player of world.getPlayers()) {
    teleportToStartPoint(player);
    player.setSpawnPoint({dimension: world.getDimension("overworld"), x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z});
    resetPlayerHealth(player, 2); // 体力を2ハートに設定
  }

  // カウントダウン開始
  countdown();
}

// テレポート
function teleportToStartPoint(player: Player) {

  const dimension = world.getDimension("overworld");
  const raycastResult = dimension.getBlockFromRay(spawnPoint, {x: 0, y: -1, z: 0});

  if (raycastResult) {
    spawnPoint.y = raycastResult.block.location.y + 1;
  }
  player.teleport(spawnPoint);
}

// バリアブロックで囲む
function createBarrierCage() {
  const dimension = world.getDimension("overworld");
  const minX = spawnPoint.x - 2;
  const maxX = spawnPoint.x + 2;
  const minY = spawnPoint.y;
  const maxY = spawnPoint.y + 3;
  const minZ = spawnPoint.z - 2;
  const maxZ = spawnPoint.z + 2;

  // 北側の壁
  dimension.runCommandAsync(`fill ${minX} ${minY} ${minZ} ${maxX} ${maxY} ${minZ} minecraft:barrier`);
  // 南側の壁
  dimension.runCommandAsync(`fill ${minX} ${minY} ${maxZ} ${maxX} ${maxY} ${maxZ} minecraft:barrier`);
  // 西側の壁
  dimension.runCommandAsync(`fill ${minX} ${minY} ${minZ} ${minX} ${maxY} ${maxZ} minecraft:barrier`);
  // 東側の壁
  dimension.runCommandAsync(`fill ${maxX} ${minY} ${minZ} ${maxX} ${maxY} ${maxZ} minecraft:barrier`);
}

// バリアブロックを消去
function removeBarrierCage() {
  const dimension = world.getDimension("overworld");
  const minX = spawnPoint.x - 2;
  const maxX = spawnPoint.x + 2;
  const minY = spawnPoint.y;
  const maxY = spawnPoint.y + 3;
  const minZ = spawnPoint.z - 2;
  const maxZ = spawnPoint.z + 2;

  // 北側の壁
  dimension.runCommandAsync(`fill ${minX} ${minY} ${minZ} ${maxX} ${maxY} ${minZ} minecraft:air`);
  // 南側の壁
  dimension.runCommandAsync(`fill ${minX} ${minY} ${maxZ} ${maxX} ${maxY} ${maxZ} minecraft:air`);
  // 西側の壁
  dimension.runCommandAsync(`fill ${minX} ${minY} ${minZ} ${minX} ${maxY} ${maxZ} minecraft:air`);
  // 東側の壁
  dimension.runCommandAsync(`fill ${maxX} ${minY} ${minZ} ${maxX} ${maxY} ${maxZ} minecraft:air`);
}

// カウントダウン
function countdown() {
  if (gameStartTimer > 0) {
    world.sendMessage(`ゲーム開始まで: ${gameStartTimer}秒`);
    gameStartTimer--;
    system.runTimeout(countdown, TicksPerSecond);
  } else {
    removeBarrierCage();
    gameStarted = true;
    world.sendMessage("ゲームスタート！");
    startScoreboard();
    startGameTimer();
  }
}

// ゲームタイマー表示
function startGameTimer() {
  system.runInterval(() => {
    if (gameStarted) {
      for (const player of world.getPlayers()) {
        player.onScreenDisplay.setActionBar(`ゲーム残り時間: ${gameTimer}秒`);
      }
    }
  }, TicksPerSecond);
}

// スコアボード表示
function startScoreboard() {
  const scoreInterval = system.runInterval(() => {
    if (gameTimer <= 60) {
      // ゲーム終了1分前にスコアボードを非表示
      world.sendMessage("ゲーム終了1分前！");
      world.scoreboard.clearObjectiveAtDisplaySlot(DisplaySlotId.Sidebar);
      system.clearRun(scoreInterval);
    } else {
      updateScoreboard();
    }
  }, TicksPerSecond);
}

// スコアボード更新
function updateScoreboard() {
  const objective = world.scoreboard.getObjective("distance") || world.scoreboard.addObjective("distance", "スタート地点からの距離");
  world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, {objective: objective, sortOrder: ObjectiveSortOrder.Descending});

  for (const player of world.getPlayers()) {
    const distance = Math.floor(Math.sqrt(
      Math.pow(player.location.x - spawnPoint.x, 2) +
      Math.pow(player.location.y - spawnPoint.y, 2) +
      Math.pow(player.location.z - spawnPoint.z, 2)
    ));
    player.runCommandAsync(`scoreboard players set @s distance ${distance}`);
  }
}

// プレイヤーの体力設定
function resetPlayerHealth(player: Player, hearts: number) {
  const healthComponent = player.getComponent(EntityHealthComponent.componentId) as EntityHealthComponent;
  healthComponent.setCurrentValue(hearts * 2);
}

// ゲーム終了
function endGame() {
  gameStarted = false;
  world.sendMessage("ゲーム終了！");

  // 全プレイヤーをスタート地点に戻す
  for (const player of world.getPlayers()) {
    player.teleport(spawnPoint);
  }

  // 勝者発表
  const objective = world.scoreboard.getObjective("distance");
  if (objective) {
    const scores = objective.getScores();
    const winner = scores.reduce((prev, current) => (prev.score > current.score ? prev : current));
    world.sendMessage(`勝者: ${winner.participant.displayName} (${winner.score}ブロック)`);
  }
}

// ゲームスタートコマンド
system.afterEvents.scriptEventReceive.subscribe((eventData) => {
  world.sendMessage(`受信: ${eventData.id}`);
  if (eventData.id === "game:start") {
    if (eventData.sourceEntity) {
      startGame(eventData.sourceEntity.location);
    }
  }
});

// ゲームタイマー
system.runInterval(() => {
  if (gameStarted) {
    gameTimer--;
    if (gameTimer <= 0) {
      endGame();
    }
  }
}, TicksPerSecond);
