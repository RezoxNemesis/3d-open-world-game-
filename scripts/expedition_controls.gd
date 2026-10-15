extends Control
## Native action fingers cannot leak into the camera or floating joystick.

const LABELS := {"attack": "STRIKE", "dodge": "DODGE", "ride": "RIDE"}
var hit_rects: Dictionary = {}
var buttons: Dictionary = {}
var scene: Node3D
var fingers: Dictionary = {}


func setup(owner_scene: Node3D) -> void:
	scene = owner_scene
	name = "HeroPowerControls"
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	for action in LABELS:
		var button := TouchScreenButton.new()
		var shape := RectangleShape2D.new()
		shape.size = Vector2(84, 60)
		button.shape = shape
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
		buttons[action].position = point
		var extent := Vector2(84, 60) * scale_value
		buttons[action].shape.size = extent
		hit_rects[action] = Rect2(point - extent * 0.5, extent)
		index += 1
	release_fingers()
	queue_redraw()


func activate(action: String) -> void:
	if not visible:
		return
	match action:
		"attack":
			scene.encounter.attack()
		"dodge":
			scene.encounter.dodge()
		"ride":
			scene.encounter.interact_vehicle()
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
	for button in buttons.values():
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
		draw_style_box(style(), rect)
		var font := ThemeDB.fallback_font
		var label: String = LABELS[action]
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


func style() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color("163235")
	box.border_color = Color("aa9568")
	box.set_border_width_all(1)
	box.set_corner_radius_all(14)
	return box
