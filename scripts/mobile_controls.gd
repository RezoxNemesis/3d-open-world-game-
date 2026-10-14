extends Control
## Multi-touch joystick, drag-to-look and independent TouchScreenButton actions.

var move_finger := -1
var look_finger := -1
var stick := Vector2.ZERO
var player: CharacterBody3D
var buttons: Dictionary = {}


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	player = get_parent().get_node("Player")
	size = get_viewport_rect().size
	for action in ["jump", "toggle_view", "save_game", "load_game", "map_game"]:
		var button := TouchScreenButton.new()
		var circle := CircleShape2D.new()
		circle.radius = 42 if action == "jump" else 30
		button.shape = circle
		button.action = action
		button.shape_centered = true
		add_child(button)
		buttons[action] = button
	get_viewport().size_changed.connect(resize_controls)
	resize_controls()


func joystick_center() -> Vector2:
	return Vector2(112, get_viewport_rect().size.y - 112)


func resize_controls() -> void:
	size = get_viewport_rect().size
	var corner := Vector2(size.x - 100, size.y - 100)
	buttons["jump"].position = corner
	buttons["toggle_view"].position = corner + Vector2(-100, 0)
	buttons["save_game"].position = Vector2(size.x - 80, 60)
	buttons["load_game"].position = Vector2(size.x - 160, 60)
	buttons["map_game"].position = Vector2(size.x - 240, 60)
	queue_redraw()


func _draw() -> void:
	var center := joystick_center()
	var color := Color(0.035, 0.07, 0.08, 0.64)
	var gold := Color(0.87, 0.76, 0.52, 0.72)
	draw_circle(center, 78, color)
	draw_arc(center, 78, 0, TAU, 64, gold, 1.5, true)
	draw_arc(center, 65, 0, TAU, 64, Color(gold, 0.24), 1.0, true)
	draw_circle(center + stick * 60, 28, Color(0.74, 0.78, 0.70, 0.53))
	draw_arc(center + stick * 60, 28, 0, TAU, 48, gold, 1.0, true)
	var font := ThemeDB.fallback_font
	for action in buttons:
		var position: Vector2 = buttons[action].position
		draw_circle(position, 42 if action == "jump" else 30, color)
		draw_arc(position, 42 if action == "jump" else 30, 0, TAU, 48, gold, 1.0, true)
		draw_arc(position, 37 if action == "jump" else 25, 0, TAU, 48, Color(gold, 0.25), 1.0, true)
		var label := str(action).replace("_game", "").replace("toggle_", "").to_upper()
		var text_width := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
		draw_string(
			font,
			position + Vector2(-text_width * 0.5, 5),
			label,
			HORIZONTAL_ALIGNMENT_LEFT,
			-1,
			14,
			Color("e9d7ab")
		)
	draw_string(
		font,
		center + Vector2(-19, 99),
		"MOVE",
		HORIZONTAL_ALIGNMENT_LEFT,
		-1,
		12,
		Color(0.86, 0.88, 0.81, 0.70)
	)
	draw_string(
		font,
		Vector2(size.x * 0.5 - 73, size.y - 24),
		"Swipe right to look",
		HORIZONTAL_ALIGNMENT_LEFT,
		-1,
		12,
		Color(0.86, 0.88, 0.81, 0.65)
	)


func release_movement() -> void:
	for action in ["move_left", "move_right", "move_forward", "move_backward"]:
		Input.action_release(action)
	stick = Vector2.ZERO
	move_finger = -1
	queue_redraw()


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	if event is InputEventScreenTouch:
		if event.pressed:
			if event.position.distance_to(joystick_center()) < 105 and move_finger == -1:
				move_finger = event.index
				get_viewport().set_input_as_handled()
			elif event.position.x > size.x * 0.4 and look_finger == -1:
				look_finger = event.index
		elif event.index == move_finger:
			release_movement()
		elif event.index == look_finger:
			look_finger = -1
	if event is InputEventScreenDrag:
		if event.index == move_finger:
			stick = (event.position - joystick_center()).limit_length(60) / 60
			Input.action_press("move_left", maxf(0, -stick.x))
			Input.action_press("move_right", maxf(0, stick.x))
			Input.action_press("move_forward", maxf(0, -stick.y))
			Input.action_press("move_backward", maxf(0, stick.y))
			queue_redraw()
			get_viewport().set_input_as_handled()
		elif event.index == look_finger:
			player.yaw -= event.relative.x * 0.004
			player.pitch = clampf(player.pitch - event.relative.y * 0.004, -1, 0.35)
			player.update_camera()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		release_all_actions()


func release_all_actions() -> void:
	release_movement()
	look_finger = -1
	for action in ["jump", "toggle_view", "save_game", "load_game", "map_game"]:
		Input.action_release(action)
