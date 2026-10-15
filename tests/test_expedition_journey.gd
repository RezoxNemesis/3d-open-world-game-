extends SceneTree

var checks := 0
var failures := 0


func _initialize() -> void:
	call_deferred("run")


func check(value: bool, label: String) -> void:
	checks += 1
	if not value:
		failures += 1
		push_error(label)


func run() -> void:
	var packed = load("res://scenes/expedition.tscn")
	check(packed != null, "Expedition is a real loadable scene")
	if packed == null:
		quit(1)
		return
	var scene = packed.instantiate()
	scene.save_path = "user://test-expedition-journey.json"
	scene.restore_on_start = false
	root.add_child(scene)
	for frame in range(60):
		await physics_frame
	check(scene.world.active_sector_count() <= 9, "Resident world bounded")
	check(scene.hud.size.y < 200, "HUD preserves the playfield")
	check(scene.player.is_on_floor(), "Initial spawn physically supported")
	scene.player.position = scene.encounter.vehicle.position + Vector3(0, 1.0, 2.8)
	await physics_frame
	check(not scene.player.is_on_floor(), "Mount autosave probe starts airborne")
	check(scene.encounter.interact_vehicle(), "Airborne player can board nearby cart")
	for frame in range(8):
		await physics_frame
	check(scene.autosave_supported(), "Grounded cart permits autosave despite stale airborne rider")
	scene.encounter.reset_for_destination()
	scene.open_atlas()
	check(not scene.player.is_physics_processing(), "Atlas pauses player")
	check(not scene.mobile.visible, "Atlas releases mobile control ownership")
	scene.travel(Vector2i(781249, 0))
	check(scene.world.origin_sector.x == 781249, "Atlas reaches far eastern world")
	check(scene.player.position.length() < 128, "Distant travel retains local precision")
	check(not scene.atlas.visible, "Travel closes atlas")
	check(scene.save_expedition(), "Distant coordinates save atomically")
	scene.world.travel_to(Vector2i(-781249, 0))
	check(scene.restore_expedition(), "Distant save restores")
	check(scene.world.origin_sector.x == 781249, "Save restores correct integer sector")
	scene.encounter.player_health = 0
	scene.open_atlas()
	scene.close_atlas()
	check(not scene.player.is_physics_processing(), "Defeat cannot be bypassed through atlas")
	scene.open_atlas()
	scene.retry_encounter()
	check(not scene.player.is_physics_processing(), "Retry retains atlas pause")
	scene.close_atlas()
	check(scene.player.is_physics_processing(), "Close restores walking")
	check(scene.mobile.visible, "Close restores touch controls")
	check(
		scene.controls.contains_point(scene.controls.hit_rects.attack.get_center()),
		"Attack owns touch area"
	)
	var finger := InputEventScreenTouch.new()
	finger.index = 4
	finger.position = scene.controls.hit_rects.attack.get_center()
	finger.pressed = true
	Input.parse_input_event(finger)
	await process_frame
	check(scene.mobile.look_finger != 4, "Action finger never starts camera drag")
	finger = finger.duplicate()
	finger.pressed = false
	Input.parse_input_event(finger)
	await process_frame
	root.size = Vector2i(960, 540)
	scene.controls.resize()
	check(
		not scene.controls.hit_rects.attack.intersects(scene.controls.hit_rects.dodge),
		"Compact STRIKE and DODGE touch regions stay separate"
	)
	check(
		not scene.controls.hit_rects.dodge.intersects(scene.controls.hit_rects.ride),
		"Compact DODGE and RIDE touch regions stay separate"
	)
	DirAccess.remove_absolute(scene.save_path)
	await preload("res://tests/scene_fixture.gd").dispose_scene(self, scene)
	print("EXPEDITION_JOURNEY_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
