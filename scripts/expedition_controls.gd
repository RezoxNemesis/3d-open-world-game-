extends Control
## Native action fingers cannot leak into the camera or floating joystick.

const LABELS := {
	"attack": "STRIKE",
	"dodge": "DODGE",
	"ride": "RIDE",
	"power_flight": "FLY",
	"power_leap": "LEAP",
	"power_speed": "SPEED",
	"power_smash": "SMASH",
	"power_descend": "DIVE"
}
var hit_rects: Dictionary = {}
var buttons: Dictionary = {}
var scene: Node3D
var fingers: Dictionary = {}
var _visual_state: Array = []


func setup(owner_scene: Node3D) -> void:
	scene = owner_scene
	name = "HeroPowerControls"
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	for action in LABELS:
		var button := TouchScreenButton.new()
		var shape := RectangleShape2D.new()
		shape.size = Vector2(84, 60)
		button.shape = shape
		if str(action).begins_with("power_"):
			button.action = action
		else:
			button.pressed.connect(activate.bind(action))
		add_child(button)
		buttons[action] = button
	get_viewport().size_changed.connect(resize)
	visibility_changed.connect(release_fingers)
	resize()


func resize() -> void:
	size = get_viewport_rect().size
	var scale_value := clampf(size.x / 1280.0, 0.76, 1.0)
	var index := 0
	for action in LABELS:
		var point := Vector2(size.x * 0.50 + index * 96 * scale_value, size.y - 100)
		if index >= 3:
			point = Vector2(size.x * 0.46 + (index - 3) * 82 * scale_value, 122)
		var power := index >= 3
		buttons[action].position = point
		var extent := Vector2(72 if power else 84, 54 if power else 60) * scale_value
		extent.y = maxf(48, extent.y)
		buttons[action].shape.size = extent
		hit_rects[action] = Rect2(point - extent * 0.5, extent)
		index += 1
	release_fingers()
	queue_redraw()


func activate(action: String) -> void:
	if not visible:
		return
	scene.activate_combat(action)
	queue_redraw()


func contains_point(point: Vector2) -> bool:
	if not is_visible_in_tree():
		return false
	for rect in hit_rects.values():
		if rect.has_point(point):
			return true
	return false


func release_fingers() -> void:
	fingers.clear()
	for action in buttons:
		if str(action).begins_with("power_"):
			Input.action_release(action)
		var button: TouchScreenButton = buttons[action]
		if not is_instance_valid(button):
			continue
		if button.is_pressed():
			button.hide()
			button.visible = visible


func _input(event: InputEvent) -> void:
	if not is_visible_in_tree():
		return
	if event is InputEventScreenTouch:
		if event.canceled:
			release_fingers()
		elif event.pressed and contains_point(event.position):
			fingers[event.index] = true
		if fingers.has(event.index):
			get_viewport().set_input_as_handled()
			if not event.pressed:
				fingers.erase(event.index)
	elif event is InputEventScreenDrag and fingers.has(event.index):
		get_viewport().set_input_as_handled()


func _notification(what: int) -> void:
	if what in [NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_WM_WINDOW_FOCUS_OUT]:
		release_fingers()


func _draw() -> void:
	for action in LABELS:
		var rect: Rect2 = hit_rects[action]
		var panel := style()
		if (
			(action == "power_flight" and scene.powers.flying)
			or (action == "power_speed" and scene.powers.fast)
		):
			panel.bg_color = Color("347867")
		draw_style_box(panel, rect)
	for action in LABELS:
		var rect: Rect2 = hit_rects[action]
		var font := ThemeDB.fallback_font
		var label: String = LABELS[action]
		if action == "power_descend":
			label = "DIVE" if scene.swimming.is_water_position() else "DOWN"
		var width := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x
		draw_string(
			font,
			rect.get_center() + Vector2(-width / 2, 6),
			label,
			HORIZONTAL_ALIGNMENT_LEFT,
			-1,
			17,
			Color("eadbb9")
		)

	if scene.powers.charging:
		var bounds: Rect2 = hit_rects.power_leap
		draw_rect(
			Rect2(
				bounds.position + Vector2(5, bounds.size.y - 7),
				Vector2((bounds.size.x - 10) * scene.powers.charge_time / 1.1, 4)
			),
			Color("a7ebd5")
		)


func _process(_delta: float) -> void:
	if not is_instance_valid(scene) or not is_instance_valid(scene.powers):
		return
	var state := [
		scene.powers.flying,
		scene.powers.fast,
		scene.powers.charging,
		scene.powers.charge_time,
		scene.swimming.is_water_position()
	]
	if state != _visual_state:
		_visual_state = state
		queue_redraw()


func style() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color("163235")
	box.border_color = Color("aa9568")
	box.set_border_width_all(1)
	box.set_corner_radius_all(14)
	return box


func _exit_tree() -> void:
	release_fingers()
