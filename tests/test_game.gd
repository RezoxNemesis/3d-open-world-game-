extends SceneTree

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
	check(ResourceLoader.exists("res://scenes/main.tscn"), "playable scene exists")
	if failures > 0:
		quit(1)
		return
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	for i in range(90):
		await physics_frame
	var player = scene.get_node("Player")
	check(player.is_on_floor(), "player settles onto courtyard collision")
	var start: Vector3 = player.position
	Input.action_press("move_forward")
	for i in range(40):
		await physics_frame
	Input.action_release("move_forward")
	check(player.position.distance_to(start) > 1.5, "forward control moves player")
	for i in range(20):
		await physics_frame
	var ground_y: float = player.position.y
	Input.action_press("jump")
	await physics_frame
	await physics_frame
	Input.action_release("jump")
	for i in range(12):
		await physics_frame
	check(player.position.y > ground_y + 0.4, "jump control lifts player")
	for i in range(100):
		await physics_frame
	check(player.is_on_floor(), "jump lands on physical floor")
	player.position = Vector3(0, 2, 17)
	Input.action_press("move_backward")
	for i in range(90):
		await physics_frame
	Input.action_release("move_backward")
	check(player.position.z < 19.6, "courtyard wall blocks movement")
	var storage = load("res://scripts/save_store.gd").new()
	var path := "user://test_save.json"
	var saved := Vector3(2, 1, 3)
	check(storage.save_position(saved, path), "save writes a position")
	check(
		storage.load_position(path, Vector3.ZERO).is_equal_approx(saved), "load restores position"
	)
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_string("invalid json")
	file.close()
	check(
		storage.load_position(path, saved).is_equal_approx(saved), "corrupt save falls back safely"
	)
	for payload in [
		'{"version":2,"position":[1,2,3]}',
		'{"version":1,"position":["bad",2,3]}',
		'{"version":1,"position":[10001,2,3]}',
		'{"version":1,"position":[1,2]}',
		"null"
	]:
		file = FileAccess.open(path, FileAccess.WRITE)
		file.store_string(payload)
		file.close()
		check(
			storage.load_position(path, saved).is_equal_approx(saved),
			"invalid save schema falls back"
		)
	file = FileAccess.open(path, FileAccess.WRITE)
	file.store_string(" ".repeat(5000))
	file.close()
	check(storage.load_position(path, saved).is_equal_approx(saved), "oversized save rejected")
	DirAccess.remove_absolute(path)
	check(storage.load_position(path, saved).is_equal_approx(saved), "missing save falls back")
	var toggle := InputEventKey.new()
	toggle.keycode = KEY_V
	toggle.pressed = true
	root.push_input(toggle)
	await process_frame
	check(player.first_person and not player.model.visible, "V switches to first person")
	root.push_input(toggle.duplicate())
	await process_frame
	check(not player.first_person and player.model.visible, "V restores third person")
	check(
		scene.get_node("World").get_child_count() > 40,
		"courtyard contains procedural architecture and foliage"
	)
	var touch = scene.get_node_or_null("MobileControls")
	check(touch != null, "mobile touch controls exist")
	if touch != null:
		var press := InputEventScreenTouch.new()
		press.index = 0
		press.pressed = true
		press.position = touch.joystick_center()
		root.push_input(press, true)
		await process_frame
		var drag := InputEventScreenDrag.new()
		drag.index = 0
		drag.position = press.position + Vector2(60, 0)
		drag.relative = Vector2(60, 0)
		root.push_input(drag, true)
		await process_frame
		check(
			Input.get_action_strength("move_right") > 0.7, "touch joystick drives movement action"
		)
		press = press.duplicate()
		press.pressed = false
		root.push_input(press, true)
		await process_frame
		check(Input.get_action_strength("move_right") == 0, "touch release stops movement")
	var regions = scene.get_node("World").get_node_or_null("Regions")
	check(regions != null, "bounded region streamer exists")
	if regions != null:
		check(regions.active.size() == 9, "nine neighboring regions loaded")
		var initial_mesh: Mesh = regions.active[Vector2i.ZERO].get_child(0).mesh
		var initial_vertices = initial_mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
		regions.update_regions(Vector3(300, 0, 0))
		await process_frame
		check(
			regions.active.size() == 9 and regions.get_child_count() == 9,
			"crossing region boundary unloads old chunks"
		)
		check(regions.active.has(Vector2i(2, 0)), "new player region is loaded")
		check(not regions.active.has(Vector2i(-1, 0)), "distant region is unloaded")
		regions.update_regions(Vector3.ZERO)
		await process_frame
		var rebuilt_mesh: Mesh = regions.active[Vector2i.ZERO].get_child(0).mesh
		check(
			initial_vertices == rebuilt_mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX],
			"region reload regenerates identical terrain"
		)
	print("RESULT: %d checks, %d failures" % [checks, failures])
	scene.queue_free()
	await process_frame
	await create_timer(0.15).timeout
	quit(1 if failures else 0)
