extends Control
## Floating analog joystick and independent look/action fingers for phone play.

const MOVE_ACTIONS := ["move_left", "move_right", "move_forward", "move_backward"]
const BUTTON_ACTIONS := [
	"jump", "toggle_view", "sprint", "save_game", "load_game", "map_game", "settings_game"
]
const DEAD_ZONE := 0.12

var move_finger := -1
var look_finger := -1
var stick := Vector2.ZERO
var player: CharacterBody3D
var buttons: Dictionary = {}
var sensitivity := 1.0
var joystick_scale := 1.0
var layout_scale := 1.0
var safe_insets := Vector4(22, 22, 22, 22)
var floating_center := Vector2.ZERO
var move_origin := Vector2.ZERO
var last_running := false
var sprint_assist := false
var assist_running := false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	player = get_parent().get_node("Player")
	for action in BUTTON_ACTIONS:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		var button := TouchScreenButton.new()
		button.shape = CircleShape2D.new()
		button.action = action
		button.shape_centered = true
		button.pressed.connect(queue_redraw)
		button.released.connect(queue_redraw)
		add_child(button)
		buttons[action] = button
	# Save and load have larger, labelled buttons inside the settings sheet.
	buttons["save_game"].hide()
	buttons["load_game"].hide()
	get_viewport().size_changed.connect(resize_controls)
	visibility_changed.connect(_visibility_changed)
	resize_controls()


func configure_controls(look_sensitivity: float, stick_scale: float, assist: bool = false) -> void:
	sensitivity = clampf(look_sensitivity, 0.4, 2.0)
	joystick_scale = clampf(stick_scale, 0.75, 1.4)
	sprint_assist = assist
	release_all_actions()
	resize_controls()


func joystick_radius() -> float:
	return 82.0 * layout_scale * joystick_scale


func joystick_travel() -> float:
	return 64.0 * layout_scale * joystick_scale


func joystick_center() -> Vector2:
	if move_finger >= 0:
		return floating_center
	var radius := joystick_radius()
	return Vector2(safe_insets.x + radius + 14, size.y - safe_insets.w - radius - 14)


func resize_controls() -> void:
	size = get_viewport_rect().size
	layout_scale = clampf(minf(size.x / 1280.0, size.y / 720.0), 0.76, 1.15)
	safe_insets = Vector4(22, 22, 22, 22) * layout_scale
	if OS.has_feature("android"):
		# Android supplies physical display pixels; the controls use canvas pixels.
		var window_size := Vector2(DisplayServer.window_get_size())
		var area := DisplayServer.get_display_safe_area()
		if window_size.x > 0 and window_size.y > 0 and area.has_area():
			var ratio := size / window_size
			safe_insets.x = maxf(safe_insets.x, area.position.x * ratio.x)
			safe_insets.y = maxf(safe_insets.y, area.position.y * ratio.y)
			safe_insets.z = maxf(safe_insets.z, (window_size.x - area.end.x) * ratio.x)
			safe_insets.w = maxf(safe_insets.w, (window_size.y - area.end.y) * ratio.y)
	var right := size.x - safe_insets.z
	var bottom := size.y - safe_insets.w
	var top := safe_insets.y + 42 * layout_scale
	buttons["jump"].position = Vector2(right - 76 * layout_scale, bottom - 86 * layout_scale)
	buttons["sprint"].position = Vector2(right - 185 * layout_scale, bottom - 72 * layout_scale)
	buttons["toggle_view"].position = Vector2(
		right - 67 * layout_scale, bottom - 197 * layout_scale
	)
	buttons["settings_game"].position = Vector2(right - 45 * layout_scale, top)
	buttons["map_game"].position = Vector2(right - 140 * layout_scale, top)
	buttons["save_game"].position = Vector2(right - 235 * layout_scale, top)
	buttons["load_game"].position = Vector2(right - 330 * layout_scale, top)
	for action in buttons:
		var circle: CircleShape2D = buttons[action].shape
		circle.radius = (
			(48.0 if action == "jump" else (52.0 if action == "settings_game" else 35.0))
			* layout_scale
		)
	if move_finger >= 0:
		release_all_actions()
	queue_redraw()


func _draw() -> void:
	var center := joystick_center()
	var radius := joystick_radius()
	var travel := joystick_travel()
	var color := Color(0.025, 0.075, 0.08, 0.55)
	var gold := Color(0.88, 0.78, 0.56, 0.76)
	draw_circle(center, radius, color)
	draw_arc(center, radius, 0, TAU, 64, gold, 1.5, true)
	draw_arc(center, radius * 0.76, 0, TAU, 64, Color(gold, 0.20), 1.0, true)
	draw_circle(center + stick * travel, 29 * layout_scale, Color(0.78, 0.84, 0.75, 0.58))
	draw_arc(center + stick * travel, 29 * layout_scale, 0, TAU, 48, gold, 1.5, true)
	var font := ThemeDB.fallback_font
	var labels := {
		"jump": "JUMP",
		"sprint": "RUN",
		"toggle_view": "VIEW",
		"map_game": "MAP",
		"settings_game": "SETTINGS"
	}
	for action in labels:
		var button: TouchScreenButton = buttons[action]
		var position := button.position
		var button_radius: float = button.shape.radius
		var active: bool = (
			Input.is_action_pressed(action) or (action == "sprint" and assist_running)
		)
		var fill := Color(0.18, 0.30, 0.27, 0.92) if active else Color(0.025, 0.075, 0.08, 0.86)
		if action in ["map_game", "settings_game"]:
			fill = Color(0.12, 0.25, 0.23, 0.96) if active else Color(0.025, 0.075, 0.08, 0.90)
		draw_circle(position, button_radius, fill)
		draw_arc(position, button_radius, 0, TAU, 48, gold, 1.5, true)
		draw_arc(position, button_radius - 5, 0, TAU, 48, Color(gold, 0.20), 1.0, true)
		var font_size := maxi(16, roundi(18 * layout_scale))
		if action in ["map_game", "settings_game"]:
			font_size = maxi(14, roundi(16 * layout_scale))
		var label: String = labels[action]
		var text_width := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
		draw_string(
			font,
			position + Vector2(-text_width * 0.5, font_size * 0.34),
			label,
			HORIZONTAL_ALIGNMENT_LEFT,
			-1,
			font_size,
			Color("eadbb9")
		)
	if move_finger == -1:
		draw_string(
			font,
			center + Vector2(-28 * layout_scale, radius + 22 * layout_scale),
			"MOVE",
			HORIZONTAL_ALIGNMENT_LEFT,
			-1,
			maxi(12, roundi(13 * layout_scale)),
			Color(0.88, 0.92, 0.85, 0.74)
		)


func _process(_delta: float) -> void:
	var running := Input.is_action_pressed("sprint") or assist_running
	if running != last_running:
		last_running = running
		queue_redraw()


func release_movement() -> void:
	_set_assist_running(false)
	for action in MOVE_ACTIONS:
		Input.action_release(action)
	stick = Vector2.ZERO
	move_finger = -1
	queue_redraw()


func _over_action_button(position: Vector2) -> bool:
	var powers := get_parent().get_node_or_null("HUD/HeroPowerControls")
	if powers != null and powers.has_method("contains_point") and powers.contains_point(position):
		return true
	for action in buttons:
		var button: TouchScreenButton = buttons[action]
		if button.visible and position.distance_to(button.position) <= button.shape.radius + 4:
			return true
	return false


func _set_movement(position: Vector2) -> void:
	stick = (position - move_origin).limit_length(joystick_travel()) / joystick_travel()
	var magnitude := stick.length()
	_set_assist_running(sprint_assist and move_finger >= 0 and magnitude >= 0.92)
	var analog := Vector2.ZERO
	if magnitude > DEAD_ZONE:
		analog = stick.normalized() * (magnitude - DEAD_ZONE) / (1.0 - DEAD_ZONE)
	var strengths := [-analog.x, analog.x, -analog.y, analog.y]
	for i in range(MOVE_ACTIONS.size()):
		var strength := maxf(0.0, strengths[i])
		if strength > 0:
			Input.action_press(MOVE_ACTIONS[i], strength)
		else:
			Input.action_release(MOVE_ACTIONS[i])
	queue_redraw()


func _set_assist_running(active: bool) -> void:
	assist_running = active
	if is_instance_valid(player):
		player.set_sprint_enabled(active)


func _unhandled_input(event: InputEvent) -> void:
	if not is_visible_in_tree():
		return
	if event is InputEventScreenTouch:
		if event.canceled or not event.pressed:
			if event.index == move_finger:
				release_movement()
			elif event.index == look_finger:
				look_finger = -1
			return
		if _over_action_button(event.position):
			return
		if event.position.x <= size.x * 0.43 and event.position.y >= size.y * 0.46:
			if move_finger == -1:
				move_finger = event.index
				move_origin = event.position
				var radius := joystick_radius()
				floating_center = Vector2(
					clampf(event.position.x, safe_insets.x + radius, size.x * 0.43 - radius),
					clampf(
						event.position.y, size.y * 0.46 + radius, size.y - safe_insets.w - radius
					)
				)
				_set_movement(event.position)
				get_viewport().set_input_as_handled()
		elif event.position.x > size.x * 0.43 and look_finger == -1:
			look_finger = event.index
			get_viewport().set_input_as_handled()
	elif event is InputEventScreenDrag:
		if event.index == move_finger:
			_set_movement(event.position)
			get_viewport().set_input_as_handled()
		elif event.index == look_finger:
			player.rotate_camera(event.relative / layout_scale, sensitivity)
			get_viewport().set_input_as_handled()


func _visibility_changed() -> void:
	if not is_visible_in_tree():
		release_all_actions()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		release_all_actions()


func _exit_tree() -> void:
	release_all_actions()


func release_all_actions() -> void:
	release_movement()
	look_finger = -1
	for action in BUTTON_ACTIONS:
		if buttons.has(action) and is_instance_valid(buttons[action]):
			var button: TouchScreenButton = buttons[action]
			if button.is_pressed():
				# Clear the native finger latch too: merely releasing Input leaves
				# TouchScreenButton pressed when Android loses focus mid-gesture.
				var was_visible := button.visible
				button.hide()
				button.visible = was_visible
		if InputMap.has_action(action):
			Input.action_release(action)
	if is_instance_valid(player) and player.has_method("set_sprint_enabled"):
		player.set_sprint_enabled(false)
		player.velocity.x = 0.0
		player.velocity.z = 0.0
