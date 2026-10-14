extends Node3D

var storage = preload("res://scripts/save_store.gd").new()
var status: Label


func _enter_tree() -> void:
	var bindings := {
		"move_forward": [KEY_W, KEY_UP],
		"move_backward": [KEY_S, KEY_DOWN],
		"move_left": [KEY_A, KEY_LEFT],
		"move_right": [KEY_D, KEY_RIGHT],
		"jump": [KEY_SPACE],
		"toggle_view": [],
		"save_game": [],
		"load_game": []
	}
	for action in bindings:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
			for code in bindings[action]:
				var event := InputEventKey.new()
				event.physical_keycode = code
				InputMap.action_add_event(action, event)


func _ready() -> void:
	for action in ["toggle_view", "save_game", "load_game"]:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
	var mobile = preload("res://scripts/mobile_controls.gd").new()
	mobile.name = "MobileControls"
	add_child(mobile)

	var canvas := CanvasLayer.new()
	add_child(canvas)
	var panel := PanelContainer.new()
	panel.position = Vector2(24, 24)
	canvas.add_child(panel)
	var box := VBoxContainer.new()
	panel.add_child(box)
	var title := Label.new()
	title.text = "  TEMPLE REALM  /  The Sunken Sanctuary  "
	title.add_theme_font_size_override("font_size", 25)
	box.add_child(title)
	var instructions := Label.new()
	instructions.text = (
		"  Left stick: move   Right swipe: look   JUMP: jump\n"
		+ "  VIEW: camera   SAVE / LOAD: local progress  "
	)
	box.add_child(instructions)
	status = Label.new()
	status.text = "  Procedural courtyard • explore the stairs and sanctuary  "
	box.add_child(status)
	print("TEMPLE_REALM_READY: courtyard, physics player, camera and HUD initialized")


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		var player := get_node("Player") as CharacterBody3D
		if event.keycode == KEY_F5:
			status.text = (
				"  Saved locally  " if storage.save_position(player.position) else "  Save failed  "
			)
		elif event.keycode == KEY_F9:
			player.position = storage.load_position()
			player.velocity = Vector3.ZERO
			status.text = "  Local save loaded  "


func _process(_delta: float) -> void:
	var player := get_node("Player") as CharacterBody3D
	if Input.is_action_just_pressed("save_game"):
		status.text = (
			"  Saved locally  " if storage.save_position(player.position) else "  Save failed  "
		)
	elif Input.is_action_just_pressed("load_game"):
		player.position = storage.load_position()
		player.velocity = Vector3.ZERO
		status.text = "  Local save loaded  "
