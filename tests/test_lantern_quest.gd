extends SceneTree

const SCENE_FIXTURE := preload("res://tests/scene_fixture.gd")
const SAVE_PATH := "user://lantern_quest_test.json"

var checks := 0
var failures := 0


func check(condition: bool, label: String) -> void:
	checks += 1
	if condition:
		print("PASS: " + label)
	else:
		failures += 1
		push_error("FAIL: " + label)


func _initialize() -> void:
	call_deferred("run")


func run() -> void:
	check(ResourceLoader.exists("res://scripts/lantern_quest.gd"), "lantern quest exists")
	if failures:
		finish()
		return
	var scene = load("res://scenes/main.tscn").instantiate()
	scene.settings_path = "user://quest_settings_test.json"
	root.add_child(scene)
	await process_frame
	var player = scene.get_node("Player")
	player.set_physics_process(false)
	var quest = scene.quest
	check(quest.stage == 0, "new journey begins with a genuine available quest")
	check(not quest.reward.visible, "unearned lantern is hidden")
	player.position = Vector3(-10, 0, 12)
	check(not quest.accept(), "quest cannot start away from keeper")
	player.position = quest.GUIDE_POSITION + Vector3(0, 0, 1)
	check(quest.context() == "keeper", "keeper interaction requires actual proximity")
	check(not quest.collect(), "quest item cannot be claimed before accepting")
	check(not quest.deliver(), "reward cannot be claimed before recovering lantern")
	check(quest.accept() and quest.stage == 1, "keeper starts the forgotten garden quest")
	check(not quest.accept(), "accepting twice does not duplicate progression")
	player.position = quest.RELIC_POSITION - Vector3(0, 10, 0)
	check(quest.context() != "relic", "standing under temple does not reach upper relic")
	check(not quest.collect(), "relic pickup validates vertical distance")
	scene.exploration.visit(player.position)
	check(
		not scene.exploration.discovered.has("sky_temple"),
		"upper landmark cannot be discovered below terrace"
	)
	player.position = quest.RELIC_POSITION + Vector3(0, 0, 1)
	scene.exploration.visit(player.position)
	check(scene.exploration.discovered.has("sky_temple"), "reaching upper temple earns landmark")
	check(quest.context() == "relic", "accepted quest exposes nearby relic interaction")
	check(quest.collect() and quest.stage == 2, "nearby lantern pickup advances real quest")
	check(not quest.relic.visible, "recovered world lantern disappears")
	check(not quest.collect(), "recovered lantern cannot be collected again")
	check(not quest.deliver(), "keeper reward cannot be claimed from upper temple")
	player.position = quest.GUIDE_POSITION + Vector3(0, 0, 1)
	check(quest.deliver() and quest.stage == 3, "returning lantern completes keeper quest")
	check(quest.reward.visible, "completed quest grants visible traveler lantern")
	check(not quest.deliver(), "completed reward cannot be duplicated")
	scene.save_game(SAVE_PATH)
	var saved: Dictionary = scene.storage.load_state(SAVE_PATH)
	check(saved.valid and saved.quest_stage == 3, "journey persists completed quest")
	quest.restore_stage(0)
	scene.exploration.restore_discovered([])
	scene.load_game(SAVE_PATH)
	check(quest.stage == 3 and quest.reward.visible, "load restores earned visual reward")
	check(scene.exploration.discovered.has("sky_temple"), "load restores fourth landmark")
	await check_minimap(scene, player)
	await check_dialogue(scene, player)
	await check_save_schema(scene.storage)
	DirAccess.remove_absolute(SAVE_PATH)
	await SCENE_FIXTURE.dispose_scene(self, scene)
	finish()


func check_minimap(scene: Node3D, player: CharacterBody3D) -> void:
	var minimap = scene.quest_ui.minimap
	var context_rect: Rect2 = scene.quest_ui.context_button.get_global_rect()
	var controls = scene.get_node("MobileControls")
	for action in ["sprint", "jump", "toggle_view"]:
		var button = controls.buttons[action]
		var radius: float = button.shape.radius
		var native_bounds := Rect2(button.position - Vector2.ONE * radius, Vector2.ONE * radius * 2)
		check(
			not context_rect.intersects(native_bounds),
			"context action avoids native " + action + " target"
		)

	var frame := Rect2(Vector2.ZERO, minimap.size)
	player.yaw = PI * 0.5
	check(
		minimap.facing_arrow()[0].x < minimap.size.x * 0.5 - 7,
		"west camera heading points west on north-up map"
	)
	player.yaw = -PI * 0.5
	check(
		minimap.facing_arrow()[0].x > minimap.size.x * 0.5 + 7,
		"east camera heading points east on north-up map"
	)
	player.yaw = 0

	player.position = Vector3.ZERO
	var first: Vector2 = minimap.project(Vector3(30, 0, -4))
	player.position = Vector3(12, 0, 0)
	check(minimap.project(Vector3(30, 0, -4)).x < first.x, "minimap follows actual world position")
	for point in [Vector3(46, 10, -42), Vector3(-30, 0, 1), Vector3(10000, 0, 10000)]:
		check(frame.has_point(minimap.project(point)), "minimap markers stay inside its frame")
	scene.toggle_map()
	await process_frame
	var diagram_rect := Rect2(Vector2.ZERO, scene.map_diagram.size)
	check(scene.map_buttons.size() == 4, "district map contains four actual landmarks")
	for button in scene.map_buttons.values():
		check(diagram_rect.encloses(button.get_rect()), "every landmark button fits map diagram")
	scene.toggle_map()


func check_dialogue(scene: Node3D, player: CharacterBody3D) -> void:
	scene.quest.restore_stage(0)
	player.position = scene.quest.GUIDE_POSITION + Vector3(0, 0, 1)
	player.set_physics_process(true)
	Input.action_press("move_forward")
	Input.action_press("sprint")
	check(scene.quest_ui.open_dialog(), "nearby keeper opens a real dialogue")
	check(scene.quest_ui.dialog_open, "dialogue becomes visible")
	check(not player.is_physics_processing(), "dialogue freezes character physics")
	check(not scene.get_node("MobileControls").visible, "dialogue hides play controls")
	check(not Input.is_action_pressed("sprint"), "dialogue clears held sprint")
	check(not Input.is_action_pressed("move_forward"), "dialogue clears movement")
	scene.quest_ui.primary_button.emit_signal("pressed")
	check(scene.quest.stage == 1, "dialogue accept button advances quest")
	check(not scene.quest_ui.dialog_open, "accept closes dialogue")
	check(player.is_physics_processing(), "accept restores character control")
	scene.quest_ui.open_dialog()
	scene.toggle_map()
	check(scene.map_overlay.visible and not scene.quest_ui.dialog_open, "map replaces dialogue")
	check(not player.is_physics_processing(), "map replacement preserves pause")
	scene.toggle_settings()
	check(scene.settings_overlay.visible and not scene.map_overlay.visible, "settings replaces map")
	scene.toggle_settings()
	check(player.is_physics_processing(), "closing all overlays restores play")
	root.size = Vector2i(960, 540)
	root.content_scale_size = root.size
	scene.resize_hud()
	await process_frame
	player.position = scene.quest.GUIDE_POSITION + Vector3(0, 0, 1)
	scene.quest_ui.open_dialog()
	await process_frame
	var screen := Rect2(Vector2.ZERO, Vector2(960, 540))
	print(
		(
			"QUEST_COMPACT: viewport=%s dialog=%s action=%s"
			% [
				scene.get_viewport().get_visible_rect(),
				scene.quest_ui.dialog_panel.get_global_rect(),
				scene.quest_ui.primary_button.get_global_rect()
			]
		)
	)
	check(
		screen.encloses(scene.quest_ui.dialog_panel.get_global_rect()),
		"compact dialogue stays on screen"
	)
	check(
		screen.encloses(scene.quest_ui.primary_button.get_global_rect()),
		"compact dialogue action remains visible"
	)
	scene.quest_ui.close_dialog()


func check_save_schema(storage: RefCounted) -> void:
	for version in [1, 2]:
		var payload := {"version": version, "position": [1, 2, 3]}
		if version == 2:
			payload.discovered = ["sanctuary"]
		write_fixture(JSON.stringify(payload))
		var state: Dictionary = storage.load_state(SAVE_PATH)
		check(state.valid and state.quest_stage == 0, "older save migrates with available quest")
	for invalid in [true, "complete", -1, 4, 1.5, null, []]:
		write_fixture(
			JSON.stringify(
				{"version": 3, "position": [1, 2, 3], "discovered": [], "quest_stage": invalid}
			)
		)
		check(not storage.load_state(SAVE_PATH).valid, "malformed quest stage rejected safely")


func write_fixture(payload: String) -> void:
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	file.store_string(payload)
	file.close()


func finish() -> void:
	print("LANTERN_QUEST_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
