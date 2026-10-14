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
	for action in ["jump", "toggle_view", "save_game", "load_game"]:
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
	queue_redraw()


func _draw() -> void:
	var center := joystick_center()
	var color := Color(0.10, 0.19, 0.18, 0.70)
	draw_circle(center, 78, color)
	draw_arc(center, 78, 0, TAU, 64, Color(0.8, 0.9, 0.8, 0.7), 2)
	draw_circle(center + stick * 60, 29, Color(0.8, 0.85, 0.65, 0.7))
	var font := ThemeDB.fallback_font
	for action in buttons:
		var position: Vector2 = buttons[action].position
		draw_circle(position, 42 if action == "jump" else 30, color)
		var label := str(action).replace("_game", "").replace("toggle_", "").to_upper()
		draw_string(font, position + Vector2(-21, 6), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 16)


func release_movement() -> void:
	for action in ["move_left", "move_right", "move_forward", "move_backward"]:
		Input.action_release(action)
	stick = Vector2.ZERO
	move_finger = -1
	queue_redraw()


func _unhandled_input(event: InputEvent) -> void:
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
		release_movement()
		look_finger = -1
		Input.action_release("jump")
