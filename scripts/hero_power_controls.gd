extends Control
## Native multi-finger power actions with explicit touch bounds and charge feedback.

const LABELS := {
	"power_flight": "FLY",
	"power_leap": "LEAP",
	"power_speed": "SPEED",
	"power_smash": "SMASH",
	"power_descend": "DOWN"
}
var buttons: Dictionary = {}
var hit_rects: Dictionary = {}
var powers: Node
var scene: Node3D
var _fingers: Dictionary = {}
var _normal_style: StyleBoxFlat
var _active_style: StyleBoxFlat
var _last_visual_state: Array = []


func setup(owner_scene: Node3D, controller: Node) -> void:
	scene = owner_scene
	powers = controller
	name = "HeroPowerControls"
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_normal_style = _button_style(Color("10292c"))
	_active_style = _button_style(Color("285b53"))
	for action in LABELS:
		var button := TouchScreenButton.new()
		var shape := RectangleShape2D.new()
		shape.size = Vector2(62, 52)
		button.shape = shape
		button.action = action
		button.shape_centered = true
		button.pressed.connect(queue_redraw)
		button.released.connect(queue_redraw)
		add_child(button)
		buttons[action] = button
	visibility_changed.connect(_visibility_changed)
	powers.notice.connect(scene.show_notice)
	resize(Rect2(Vector2.ZERO, get_viewport_rect().size), get_viewport_rect().size)


func resize(safe: Rect2, viewport_size: Vector2) -> void:
	release_all_actions()
	size = viewport_size
	var first := maxf(safe.position.x + 416, safe.position.x + safe.size.x * 0.36)
	var top := safe.position.y + 56
	var index := 0
	for action in LABELS:
		var button: TouchScreenButton = buttons[action]
		button.position = Vector2(first + index * 76, top)
		if action == "power_descend":
			button.position = Vector2(first + 228, top + 94)
		hit_rects[action] = Rect2(button.position - Vector2(31, 26), Vector2(62, 52))
		index += 1
	_update_visibility()
	queue_redraw()


func contains_point(point: Vector2) -> bool:
	if not is_visible_in_tree():
		return false
	for action in hit_rects:
		if buttons[action].visible and hit_rects[action].has_point(point):
			return true
	return false


func feedback_bounds() -> Rect2:
	var font := ThemeDB.fallback_font
	var baseline: Vector2 = hit_rects.power_flight.position + Vector2(0, 73)
	var extent := font.get_string_size(powers.status(), HORIZONTAL_ALIGNMENT_LEFT, -1, 14)
	return Rect2(baseline - Vector2(0, font.get_ascent(14)), Vector2(extent.x, font.get_height(14)))


func release_all_actions() -> void:
	if is_instance_valid(powers):
		powers.cancel_actions()
	_fingers.clear()
	for action in buttons:
		var button: TouchScreenButton = buttons[action]
		if button.is_pressed():
			var was_visible := button.visible
			button.hide()
			button.visible = was_visible
		if InputMap.has_action(action):
			Input.action_release(action)
	queue_redraw()


func _input(event: InputEvent) -> void:
	if not is_visible_in_tree():
		return
	if event is InputEventScreenTouch:
		if event.canceled:
			release_all_actions()
			return
		if event.pressed and contains_point(event.position):
			_fingers[event.index] = true
		if _fingers.has(event.index):
			# Native child buttons receive _input before this parent; stop the same
			# finger reaching the legacy camera's unhandled-input look ownership.
			get_viewport().set_input_as_handled()
			if not event.pressed:
				_fingers.erase(event.index)
	elif event is InputEventScreenDrag and _fingers.has(event.index):
		get_viewport().set_input_as_handled()


func _notification(what: int) -> void:
	if what in [NOTIFICATION_WM_WINDOW_FOCUS_OUT, NOTIFICATION_APPLICATION_FOCUS_OUT]:
		release_all_actions()


func _visibility_changed() -> void:
	if not is_visible_in_tree():
		release_all_actions()


func _process(_delta: float) -> void:
	if not is_instance_valid(powers):
		return
	var state := [powers.flying, powers.fast, powers.charging, powers.charge_time, powers.status()]
	for action in buttons:
		state.append(Input.is_action_pressed(action))
	if state != _last_visual_state:
		_last_visual_state = state
		_update_visibility()
		queue_redraw()


func _update_visibility() -> void:
	if buttons.has("power_descend") and is_instance_valid(powers):
		buttons.power_descend.visible = powers.flying


func _draw() -> void:
	if not is_instance_valid(powers):
		return
	var font := ThemeDB.fallback_font
	for action in buttons:
		if not buttons[action].visible:
			continue
		var bounds: Rect2 = hit_rects[action]
		var active := Input.is_action_pressed(action)
		active = active or (action == "power_flight" and powers.flying)
		active = active or (action == "power_speed" and powers.fast)
		draw_style_box(_active_style if active else _normal_style, bounds)
	# Keep all flat backgrounds before the shared font atlas, avoiding a canvas
	# texture transition for every button while preserving the same real targets.
	for action in buttons:
		if not buttons[action].visible:
			continue
		var bounds: Rect2 = hit_rects[action]
		var label: String = LABELS[action]
		var width := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
		draw_string(
			font,
			bounds.get_center() + Vector2(-width * 0.5, 5),
			label,
			HORIZONTAL_ALIGNMENT_LEFT,
			-1,
			15,
			Color("f1d18c")
		)
	var origin: Vector2 = hit_rects.power_flight.position + Vector2(0, 73)
	draw_string(font, origin, powers.status(), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("f1dfb5"))
	if powers.charging:
		var bounds: Rect2 = hit_rects.power_leap
		var bar := Rect2(
			bounds.position + Vector2(5, bounds.size.y - 8),
			Vector2((bounds.size.x - 10) * powers.charge_time / 1.1, 4)
		)
		draw_rect(bar, Color("90ddbf"))


func _button_style(fill: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = Color("c0a25b")
	style.set_border_width_all(1)
	style.set_corner_radius_all(9)
	return style
