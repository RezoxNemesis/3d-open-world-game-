extends SceneTree
## Cross-system behavior using the real expedition, native input, physics and save files.

const FIXTURE := preload("res://tests/scene_fixture.gd")
const SAVE_PATH := "user://test-expedition-expansion.json"
var checks := 0
var failures := 0
var scene: Node3D


func _initialize() -> void:
	call_deferred("run")


func check(value: bool, label: String) -> void:
	checks += 1
	if not value:
		failures += 1
		push_error(label)


func frames(count: int) -> void:
	for frame in range(count):
		await physics_frame


func key(code: Key, pressed: bool) -> void:
	var event := InputEventKey.new()
	event.physical_keycode = code
	event.keycode = code
	event.pressed = pressed
	Input.parse_input_event(event)
	await frames(2)


func touch(action: String, pressed: bool) -> void:
	var event := InputEventScreenTouch.new()
	event.index = 7
	event.position = scene.controls.hit_rects[action].get_center()
	event.pressed = pressed
	root.push_input(event, true)
	await frames(2)


func bound(action: String, code: Key) -> bool:
	for event in InputMap.action_get_events(action):
		if event is InputEventKey and event.physical_keycode == code:
			return true
	return false


func write_snapshot(data: Dictionary) -> void:
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	file.store_string(JSON.stringify(data))
	file.close()


func run() -> void:
	# Global InputMap survives scene replacement; begin with the district's bindings.
	for pair in [["power_flight", KEY_F], ["power_leap", KEY_Q]]:
		if not InputMap.has_action(pair[0]):
			InputMap.add_action(pair[0])
		var event := InputEventKey.new()
		event.physical_keycode = pair[1]
		InputMap.action_add_event(pair[0], event)
	scene = load("res://scenes/expedition.tscn").instantiate()
	scene.restore_on_start = false
	scene.save_path = SAVE_PATH
	root.add_child(scene)
	scene.atmosphere.weather.set_autonomous(false)
	await frames(60)
	await power_input_and_pause()
	await mounted_powers_and_rebase()
	await realm_buttons()
	await ocean_ownership()
	await save_migrations()
	await FIXTURE.dispose_scene(self, scene)
	scene = null
	await district_bindings()
	DirAccess.remove_absolute(SAVE_PATH)
	print("EXPEDITION_EXPANSION_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)


func power_input_and_pause() -> void:
	check(bound("power_flight", KEY_T), "Expedition maps flight to T")
	check(not bound("power_flight", KEY_F), "District F binding cannot also trigger flight")
	check(bound("power_leap", KEY_L), "Expedition maps leap to L")
	check(not bound("power_leap", KEY_Q), "District Q binding cannot also trigger leap")
	await key(KEY_F, true)
	await key(KEY_F, false)
	check(not scene.powers.flying, "Actual F combat key never enables flight")
	await key(KEY_Q, true)
	await key(KEY_Q, false)
	check(scene.encounter.dodge_cooldown > 0, "Actual Q reaches combat dodge")
	check(not scene.powers.charging, "Actual Q never charges power leap")
	await key(KEY_T, true)
	await key(KEY_T, false)
	check(scene.powers.flying, "Actual T enables flight")
	await key(KEY_T, true)
	await key(KEY_T, false)
	await frames(70)
	await key(KEY_L, true)
	await frames(12)
	check(scene.powers.charging, "Actual L charges while grounded")
	scene.open_atlas()
	check(not scene.powers.charging, "Atlas cancels a held power charge")
	check(not Input.is_action_pressed("power_leap"), "Atlas releases held leap action")
	await key(KEY_L, false)
	scene.close_atlas()
	await frames(20)
	check(scene.player.is_on_floor(), "Closing atlas cannot release a canceled leap")
	await touch("power_leap", true)
	await frames(10)
	check(scene.powers.charging, "Native LEAP touch reaches power controller")
	check(scene.mobile.look_finger != 7, "Power finger never owns camera drag")
	scene.open_atlas()
	check(not scene.powers.charging, "Atlas cancels native LEAP charge")
	check(not scene.controls.buttons.power_leap.is_pressed(), "Atlas clears native finger latch")
	await touch("power_leap", false)
	scene.close_atlas()
	await frames(10)
	check(scene.player.is_on_floor(), "Native charge cancellation preserves grounded player")


func mounted_powers_and_rebase() -> void:
	scene.travel(Vector2i.ZERO)
	await frames(50)
	scene.player.position = scene.encounter.vehicle.position + Vector3(0, 0.05, 2.8)
	await frames(12)
	await touch("power_leap", true)
	check(scene.powers.charging, "Near-cart player can begin a power charge")
	scene.activate_combat("ride")
	check(scene.encounter.mounted, "RIDE transfers movement ownership to cart")
	check(not scene.powers.charging, "Mount cancels pending leap")
	check(not scene.powers.flying, "Mount excludes powered flight")
	check(not scene.player.is_physics_processing(), "Mounted player does not apply movement twice")
	await touch("power_leap", false)
	scene.open_atlas()
	scene.close_atlas()
	check(not scene.player.is_physics_processing(), "Closing atlas preserves cart ownership")
	scene.activate_combat("ride")
	await frames(12)
	check(not scene.encounter.mounted, "Second RIDE returns to walking")
	check(scene.player.is_on_floor(), "Dismount provides real ground support")
	check(scene.player.collision_mask != 0, "Dismount restores player collision")
	scene.player.position = Vector3(62, 0.05, 12)
	await frames(5)
	var anchor: Vector3 = scene.powers.mountains.position
	Input.action_press("move_right")
	await frames(50)
	Input.action_release("move_right")
	check(scene.world.origin_sector == Vector2i(1, 0), "Actual walking crosses origin boundary")
	check(
		scene.powers.mountains.position == anchor - Vector3(128, 0, 0),
		"Destructible crags preserve world location across floating-origin shift"
	)
	scene.powers.mountains.restore_destroyed(["crag_east"])
	scene.travel(Vector2i(64, 0))
	check(scene.powers.mountains.position == Vector3.ZERO, "Atlas resets crag coordinate anchor")
	check(scene.powers.mountains.destroyed_ids().is_empty(), "New destination resets local crags")


func realm_buttons() -> void:
	for pair in [["Dragonwall Pass", Vector2i(64, 0)], ["Imperial Terrace", Vector2i(128, 0)]]:
		scene.open_atlas()
		var destination: Button
		for button: Button in scene.atlas.find_children("*", "Button", true, false):
			if button.text.begins_with(pair[0]):
				destination = button
		check(destination != null, "Atlas exposes " + pair[0])
		if destination == null:
			continue
		destination.pressed.emit()
		await frames(60)
		check(scene.world.origin_sector == pair[1], "Atlas button reaches " + pair[0])
		check(not scene.atlas.visible, "Realm arrival closes atlas")
		check(scene.player.is_on_floor(), "Realm arrival has synchronous collision support")
		check(scene.world.active_sector_count() <= 9, "Realm arrival bounds streamed sectors")


func ocean_ownership() -> void:
	scene.travel(Vector2i(256, 0))
	await frames(100)
	check(scene.swimming.is_swimming(), "Sea arrival transfers movement to swimming")
	check(not scene.encounter.region_active, "Sea disables land encounter")
	check(not scene.encounter.vehicle.visible, "Sea hides land cart")
	check(scene.encounter.vehicle.collision_layer == 0, "Sea removes cart collision")
	check(not scene.encounter.interact_vehicle(), "Direct RIDE cannot mount submerged cart")
	check(not scene.encounter.attack(), "Direct attack cannot target inactive land guardian")
	scene.open_atlas()
	scene.close_atlas()
	check(not scene.encounter.region_active, "Atlas close preserves inactive land encounter")
	check(scene.player.is_physics_processing(), "Atlas close restores swimming movement")
	var before: float = scene.player.position.y
	await touch("power_descend", true)
	await frames(100)
	await touch("power_descend", false)
	check(scene.player.position.y < before - 3, "Native DIVE descends underwater")
	check(scene.swimming.is_swimming(), "Diving retains swimming ownership")
	await touch("power_flight", true)
	await touch("power_flight", false)
	check(scene.powers.flying, "Native FLY can take ownership underwater")
	check(not scene.swimming.is_swimming(), "Flight takes precedence over swimming")
	Input.action_press("jump")
	await frames(40)
	Input.action_release("jump")
	check(scene.player.position.y > 1, "Flying rises out of sea through player collision motion")
	await touch("power_flight", true)
	await touch("power_flight", false)
	await frames(120)
	await paused_wyrm()
	scene.travel(Vector2i.ZERO)
	await frames(60)
	check(not scene.swimming.is_water_position(), "Land return leaves water domain")
	check(not scene.player.get_meta("water_swimming", false), "Land return clears swim pose")
	check(scene.encounter.region_active, "Land return restores guardian encounter")
	check(scene.encounter.vehicle.collision_layer != 0, "Land return restores cart collision")
	check(scene.player.is_on_floor(), "Land return restores ordinary walking support")


func paused_wyrm() -> void:
	var creature: Node3D = scene.world.find_child("TideWyrm", true, false)
	check(creature != null, "Sea destination owns its creature")
	if creature == null:
		return
	scene.player.position = creature.global_position + Vector3(0, 0, 5)
	scene.player.velocity = Vector3.ZERO
	await frames(4)
	check(creature.state == "telegraph", "Actual submerged approach triggers creature warning")
	var health: float = scene.swimming.health
	var position: Vector3 = scene.player.position
	scene.open_atlas()
	await frames(160)
	check(scene.swimming.health == health, "Sea creature cannot damage player behind atlas")
	check(scene.player.position == position, "Atlas preserves underwater player position")
	scene.close_atlas()


func save_migrations() -> void:
	scene.travel(Vector2i(256, 0))
	scene.player.position = Vector3(-10, -5.25, 30)
	scene.player.velocity = Vector3.ZERO
	scene.atmosphere.weather.set_autonomous(false)
	scene.set_world_time(23.25)
	scene.set_world_weather("snow")
	scene.set_world_season("winter")
	var weather: Dictionary = scene.atmosphere.weather.snapshot()
	check(scene.save_expedition(), "Version 3 underwater climate save writes")
	var saved: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
	check(saved.version == 3 and saved.local[1] < 0, "Version 3 stores actual negative altitude")
	scene.world.travel_to(Vector2i.ZERO)
	scene.set_world_time(11)
	scene.set_world_weather("clear")
	check(scene.restore_expedition(), "Version 3 underwater climate save restores")
	check(scene.world.origin_sector == Vector2i(256, 0), "Save restores sea sector")
	check(is_equal_approx(scene.player.position.y, -5.25), "Save preserves submerged altitude")
	check(scene.atmosphere.weather.snapshot() == weather, "Save restores complete climate state")
	check(not scene.encounter.region_active, "Underwater restore keeps land encounters inactive")
	var coordinates: Dictionary = scene.world.world_coordinates()
	var journal: Dictionary = scene.journal.snapshot()
	for invalid in [null, {}, {"version": true}, "snow"]:
		var bad: Dictionary = saved.duplicate(true)
		bad.sector = [64, 0]
		bad.local = [0, 3, 12]
		bad.environment = invalid
		write_snapshot(bad)
		check(not scene.restore_expedition(), "Malformed environment rejects whole snapshot")
		check(scene.world.world_coordinates() == coordinates, "Bad climate cannot move player")
		check(scene.journal.snapshot() == journal, "Bad climate cannot mutate journal")
		check(scene.atmosphere.weather.snapshot() == weather, "Bad climate preserves weather")
	await legacy_migrations(weather)


func legacy_migrations(weather: Dictionary) -> void:
	write_snapshot({"version": 1, "sector": [64, 0], "local": [0, 3, 12]})
	check(scene.restore_expedition(), "Version 1 coordinates migrate to expanded world")
	check(scene.journal.visited == [Vector2i(64, 0)], "Version 1 migration records destination")
	check(scene.atmosphere.weather.snapshot() == weather, "Version 1 preserves current climate")
	write_snapshot(
		{
			"version": 2,
			"sector": [128, 0],
			"local": [0, 3, 12],
			"journal": {"regions": [[64, 0, false], [128, 0, true]]}
		}
	)
	check(scene.restore_expedition(), "Version 2 journal save migrates")
	check(Vector2i(128, 0) in scene.journal.pacified, "Migration preserves guardian pacification")
	check(scene.encounter.state == "defeated", "Migrated guardian remains calmed")
	check(scene.save_expedition(), "Migrated journal saves to newest schema")
	var upgraded: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
	check(upgraded.version == 3 and upgraded.has("environment"), "Migration writes version 3")


func district_bindings() -> void:
	var district = load("res://scenes/main.tscn").instantiate()
	district.journey_path = "user://test-expansion-district.json"
	district.autosave_enabled = false
	root.add_child(district)
	await frames(10)
	check(bound("power_flight", KEY_F), "Returning district restores default F flight binding")
	check(bound("power_leap", KEY_Q), "Returning district restores default Q leap binding")
	check(not bound("power_flight", KEY_T), "District removes expedition T binding")
	check(not bound("power_leap", KEY_L), "District removes expedition L binding")
	await FIXTURE.dispose_scene(self, district)
	DirAccess.remove_absolute("user://test-expansion-district.json")
