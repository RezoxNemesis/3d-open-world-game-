extends SceneTree
## Real record, journal and shrine controls, including compact native touch dispatch.

const FIXTURE := preload("res://tests/scene_fixture.gd")
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
	var interface = load("res://scripts/quest_interface.gd").new()
	check(interface.has_method("open_record"), "journey interface exposes actual readable records")
	check(interface.has_method("open_journal"), "journey interface exposes an earned journal")
	check(interface.has_method("open_bell"), "journey interface exposes the shrine ritual")
	interface.free()
	if failures:
		finish()
		return
	var scene = load("res://scenes/main.tscn").instantiate()
	scene.settings_path = "user://activity_interface_settings_test.json"
	root.add_child(scene)
	await process_frame
	var ui = scene.quest_ui
	var activity = ui.activities
	check(is_instance_valid(activity), "main supplies real exploration activities to the interface")
	if not is_instance_valid(activity):
		await FIXTURE.dispose_scene(self, scene)
		finish()
		return
	var player: CharacterBody3D = scene.get_node("Player")
	var controls = scene.get_node("MobileControls")
	player.set_physics_process(false)
	player.position = Vector3(0, 0, 12)
	check(
		not ui.open_record("hall") and not ui.open_record("unknown"),
		"remote and unknown records cannot open or earn lore"
	)
	check(not ui.open_bell(), "remote bell cannot open its ritual")
	check(activity.records.is_empty(), "failed record attempts leave progress unchanged")
	player.position = activity.RECORDS.bridge.position - Vector3(0, 6, 0)
	check(not ui.open_record("bridge"), "record interface rejects interaction below the skybridge")
	player.position = activity.BELL_POSITION - Vector3(0, 6, 0)
	check(not ui.open_bell(), "bell interface rejects interaction below the terrace")
	player.position = activity.RECORDS.hall.position
	ui.refresh()
	check(
		ui.context_button.visible and ui.context_button.text == "READ INSCRIPTION",
		"nearby hall exposes a genuine inscription action"
	)
	player.set_physics_process(true)
	Input.action_press("move_forward")
	Input.action_press("sprint")
	check(ui.open_record("hall"), "nearby hall record opens original readable text")
	check(
		ui.mode == "record" and ui.header_label.text == activity.RECORDS.hall.title,
		"record mode presents its own original title"
	)
	check(
		ui.dialogue_text.text == activity.RECORDS.hall.text and activity.records == ["hall"],
		"reading displays original lore and earns its unique journal entry"
	)
	check(
		not player.is_physics_processing() and not controls.visible,
		"record overlay freezes physics and hides touch controls"
	)
	check(
		not Input.is_action_pressed("move_forward") and not Input.is_action_pressed("sprint"),
		"record overlay releases held movement and native sprint actions"
	)
	ui.primary_button.emit_signal("pressed")
	check(
		not ui.dialog_open and player.is_physics_processing(),
		"record primary action closes and restores play"
	)
	player.set_physics_process(false)
	check(
		ui.open_record("hall") and activity.records == ["hall"],
		"earned nearby lore can be reread without duplication"
	)
	scene.toggle_map()
	check(scene.map_overlay.visible and not ui.dialog_open, "map safely replaces record dialogue")
	scene.toggle_settings()
	check(
		scene.settings_overlay.visible and not scene.map_overlay.visible,
		"settings safely replaces map"
	)
	player.position = Vector3(0, 0, 12)
	ui.open_journal()
	check(
		ui.mode == "journal" and ui.dialog_open and not scene.settings_overlay.visible,
		"journal opens remotely and replaces settings through the shared modal lifecycle"
	)
	check(
		(
			ui.dialogue_text.text.contains(activity.RECORDS.hall.text)
			and not ui.dialogue_text.text.contains(activity.RECORDS.bridge.text)
		),
		"remote journal exposes only actually earned lore"
	)
	check(
		ui.dialogue_text.scroll_active, "journal provides native scrolling for long earned entries"
	)
	ui.close_dialog()
	player.set_physics_process(false)
	for id in ["bridge", "shrine"]:
		player.position = activity.RECORDS[id].position
		check(ui.open_record(id), "actual readable overlay earns record: " + id)
		ui.close_dialog()
		player.set_physics_process(false)
	player.position = activity.BELL_POSITION
	ui.refresh()
	check(
		ui.context_button.text == "RING SHRINE BELL",
		"shrine exposes the correctly labelled bell action"
	)
	check(
		ui.open_bell() and ui.primary_button.text == "CLOSE",
		"incomplete lantern quest explains bell requirements"
	)
	ui.primary_button.emit_signal("pressed")
	check(not activity.blessed, "closing an ineligible bell never grants a reward")
	scene.quest.restore_stage(3)
	player.set_physics_process(false)
	check(
		ui.open_bell() and ui.primary_button.text == "RING SHRINE BELL",
		"eligible ritual exposes its real action"
	)
	player.position = activity.BELL_POSITION - Vector3(0, 6, 0)
	ui.primary_button.emit_signal("pressed")
	check(not activity.blessed, "bell action rechecks three-dimensional reach after opening")
	player.set_physics_process(false)
	player.position = activity.BELL_POSITION
	check(ui.open_bell(), "eligible bell remains available after an out-of-reach attempt")
	ui.primary_button.emit_signal("pressed")
	check(
		activity.blessed and activity.reward.visible and not ui.dialog_open,
		"bell primary action grants and displays the earned jade seal"
	)
	player.set_physics_process(false)
	check(
		ui.open_bell() and ui.primary_button.text == "CLOSE",
		"completed ritual remains readable without duplicate rewards"
	)
	ui.close_dialog()
	await compact_touch(scene, player, activity)
	await FIXTURE.dispose_scene(self, scene)
	finish()


func compact_touch(scene: Node3D, player: CharacterBody3D, activity: Node) -> void:
	root.size = Vector2i(960, 540)
	root.content_scale_size = root.size
	scene.resize_hud()
	await process_frame
	var ui = scene.quest_ui
	player.set_physics_process(false)
	player.position = activity.RECORDS.hall.position
	ui.refresh()
	await process_frame
	var controls = scene.get_node("MobileControls")
	for action in ["sprint", "jump", "toggle_view"]:
		var button = controls.buttons[action]
		var radius: float = button.shape.radius
		var native_bounds := Rect2(button.position - Vector2.ONE * radius, Vector2.ONE * radius * 2)
		check(
			not ui.context_button.get_global_rect().intersects(native_bounds),
			"compact inscription action avoids native " + action + " target"
		)
	await tap(ui.context_button)
	await process_frame
	print(
		(
			"ACTIVITY_COMPACT: panel=%s text=%s content=%s action=%s"
			% [
				ui.dialog_panel.get_global_rect(),
				ui.dialogue_text.get_global_rect(),
				ui.dialogue_text.get_content_height(),
				ui.primary_button.get_global_rect()
			]
		)
	)
	check(
		ui.dialog_open and ui.mode == "record", "actual compact ScreenTouch opens the inscription"
	)
	var screen := Rect2(Vector2.ZERO, Vector2(960, 540))
	check(
		screen.encloses(ui.dialog_panel.get_global_rect()) and ui.dialog_panel.size.y <= 350,
		"compact record panel fits the screen within its 350 pixel height"
	)
	check(
		ui.dialogue_text.get_content_height() <= ui.dialogue_text.size.y + 1.0,
		"original record story fits its readable compact text area"
	)
	check(
		screen.encloses(ui.primary_button.get_global_rect()),
		"compact record primary action stays visible"
	)
	await tap(ui.primary_button)
	check(not ui.dialog_open, "actual compact ScreenTouch closes the record")
	ui.open_journal()
	await process_frame
	check(
		(
			ui.dialogue_text.scroll_active
			and ui.dialogue_text.get_content_height() > ui.dialogue_text.size.y
		),
		"all earned journal stories exceed the panel and remain scrollable"
	)
	check(
		screen.encloses(ui.dialog_panel.get_global_rect()),
		"long journal stays within compact screen bounds"
	)
	await tap(ui.primary_button)
	check(
		not ui.dialog_open and player.is_physics_processing(),
		"actual compact journal close restores control"
	)
	player.set_physics_process(false)
	player.position = scene.quest.GUIDE_POSITION
	ui.refresh()
	check(
		ui.context_button.text == "SPEAK TO SEN",
		"legacy keeper retains context priority and its original action"
	)
	check(
		ui.open_dialog() and ui.mode == "keeper",
		"legacy keeper dialogue remains available after journal use"
	)
	ui.close_dialog()


func tap(button: Button) -> void:
	var point := button.get_global_rect().get_center()
	for pressed in [true, false]:
		var event := InputEventScreenTouch.new()
		event.index = 0
		event.position = point
		event.pressed = pressed
		Input.parse_input_event(event)
		await process_frame


func finish() -> void:
	print("ACTIVITY_INTERFACE_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
