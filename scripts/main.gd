extends Node3D

const GOLD := Color("dfc184")
const PALE := Color("e4e8df")
const MUTED := Color("aab9b5")

var storage = preload("res://scripts/save_store.gd").new()
var exploration: Node
var status: Label
var objective: Label
var notice: Label
var location: Label
var hud_panel: PanelContainer
var map_overlay: Control
var map_panel: PanelContainer
var map_diagram: Control
var map_buttons: Dictionary = {}
var notice_time := 0.0
var hud_time := 0.0


class DistrictDiagram:
	extends Control

	var player_position := Vector3.ZERO

	func project(position: Vector3) -> Vector2:
		return Vector2(
			size.x * 0.5 + position.x * size.x / 88.0, size.y * 0.58 + position.z * size.y / 60.0
		)

	func _draw() -> void:
		var center := project(Vector3.ZERO)
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.06, 0.12, 0.13, 0.94))
		for x in range(1, 9):
			var x_position := size.x * float(x) / 9.0
			draw_line(
				Vector2(x_position, 0),
				Vector2(x_position, size.y),
				Color(0.65, 0.77, 0.70, 0.065),
				1.0
			)
		for y in range(1, 6):
			var y_position := size.y * float(y) / 6.0
			draw_line(
				Vector2(0, y_position),
				Vector2(size.x, y_position),
				Color(0.65, 0.77, 0.70, 0.065),
				1.0
			)
		draw_circle(project(Vector3(-31, 0, 7)), size.y * 0.13, Color(0.13, 0.35, 0.35, 0.75))
		for target in [Vector3(-30, 0, 1), Vector3(0, 1.8, -16), Vector3(30, 0, -4)]:
			draw_line(center, project(target), Color(0.78, 0.65, 0.39, 0.30), 5.0, true)
		var player := project(player_position)
		draw_circle(player, 11, Color(0.83, 0.71, 0.47, 0.25))
		draw_circle(player, 5, Color("f8df9f"))
		draw_arc(player, 9, 0, TAU, 32, Color("e2c789"), 1.0, true)
		draw_string(
			ThemeDB.fallback_font,
			Vector2(size.x - 27, 26),
			"N",
			HORIZONTAL_ALIGNMENT_LEFT,
			-1,
			16,
			Color("dfc184")
		)


func _enter_tree() -> void:
	var bindings := {
		"move_forward": [KEY_W, KEY_UP],
		"move_backward": [KEY_S, KEY_DOWN],
		"move_left": [KEY_A, KEY_LEFT],
		"move_right": [KEY_D, KEY_RIGHT],
		"jump": [KEY_SPACE],
		"toggle_view": [],
		"save_game": [],
		"load_game": [],
		"map_game": [KEY_M]
	}
	for action in bindings:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
			for code in bindings[action]:
				var event := InputEventKey.new()
				event.physical_keycode = code
				InputMap.action_add_event(action, event)


func _ready() -> void:
	exploration = preload("res://scripts/exploration.gd").new()
	exploration.name = "Exploration"
	add_child(exploration)
	exploration.changed.connect(update_hud)
	var mobile = preload("res://scripts/mobile_controls.gd").new()
	mobile.name = "MobileControls"
	add_child(mobile)
	var canvas := CanvasLayer.new()
	canvas.layer = 2
	canvas.name = "HUD"
	add_child(canvas)
	hud_panel = PanelContainer.new()
	hud_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_panel.add_theme_stylebox_override("panel", panel_style())
	canvas.add_child(hud_panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 5)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_panel.add_child(box)
	var title := make_label("—  TEMPLE REALM", 25, GOLD)
	box.add_child(title)
	location = make_label("EASTERN TEMPLE DISTRICT", 12, MUTED)
	box.add_child(location)
	var separator := HSeparator.new()
	var line := StyleBoxLine.new()
	line.color = Color(GOLD, 0.42)
	line.thickness = 1
	separator.add_theme_stylebox_override("separator", line)
	box.add_child(separator)
	box.add_child(make_label("THE GATE BEYOND THE CLOUDS", 13, GOLD))
	objective = make_label("", 18, PALE)
	box.add_child(objective)
	status = make_label("", 13, MUTED)
	box.add_child(status)
	notice = make_label("", 13, GOLD)
	box.add_child(notice)
	notice.hide()
	build_map(canvas)
	get_viewport().size_changed.connect(resize_hud)
	resize_hud()
	update_hud()
	print(
		"TEMPLE_REALM_READY: connected temple district, exploration quest and mobile HUD initialized"
	)


func panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.045, 0.075, 0.085, 0.86)
	style.border_color = Color(GOLD, 0.55)
	style.set_border_width_all(1)
	style.set_corner_radius_all(9)
	style.content_margin_left = 18
	style.content_margin_right = 18
	style.content_margin_top = 14
	style.content_margin_bottom = 12
	return style


func make_label(text: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	return label


func build_map(canvas: CanvasLayer) -> void:
	map_overlay = Control.new()
	map_overlay.name = "DistrictMap"
	canvas.add_child(map_overlay)
	var backdrop := ColorRect.new()
	backdrop.color = Color(0.01, 0.025, 0.03, 0.76)
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	map_overlay.add_child(backdrop)
	map_panel = PanelContainer.new()
	map_panel.add_theme_stylebox_override("panel", panel_style())
	map_overlay.add_child(map_panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 12)
	map_panel.add_child(box)
	var header := HBoxContainer.new()
	box.add_child(header)
	var title := make_label("EASTERN TEMPLE DISTRICT", 22, GOLD)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	var close := Button.new()
	close.text = "CLOSE  ×"
	close.custom_minimum_size = Vector2(108, 42)
	style_button(close)
	close.pressed.connect(toggle_map)
	header.add_child(close)
	box.add_child(
		make_label("Walk to discover landmarks. Discovered waypoints allow travel.", 14, MUTED)
	)
	map_diagram = DistrictDiagram.new()
	map_diagram.custom_minimum_size = Vector2(560, 240)
	map_diagram.size_flags_vertical = Control.SIZE_EXPAND_FILL
	map_diagram.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(map_diagram)
	for landmark in exploration.landmarks:
		var button := Button.new()
		button.custom_minimum_size = Vector2(148, 48)
		button.pressed.connect(travel_from_map.bind(str(landmark.id)))
		button.add_theme_font_size_override("font_size", 13)
		style_button(button)
		map_diagram.add_child(button)
		map_buttons[landmark.id] = button
	box.add_child(
		make_label("●  Your position     —  Courtyard paths     M / MAP  to close", 13, MUTED)
	)
	map_overlay.hide()


func style_button(button: Button) -> void:
	var normal := panel_style()
	normal.bg_color = Color("10292c")
	normal.content_margin_top = 8
	normal.content_margin_bottom = 8
	button.add_theme_stylebox_override("normal", normal)
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color("2b4543")
	hover.border_color = GOLD
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", hover)
	var disabled := normal.duplicate() as StyleBoxFlat
	disabled.bg_color = Color("102020")
	disabled.border_color = Color(GOLD, 0.17)
	button.add_theme_stylebox_override("disabled", disabled)
	button.add_theme_color_override("font_color", GOLD)
	button.add_theme_color_override("font_hover_color", PALE)
	button.add_theme_color_override("font_pressed_color", PALE)
	button.add_theme_color_override("font_disabled_color", Color("75827c"))


func resize_hud() -> void:
	var viewport_size := get_viewport().get_visible_rect().size
	hud_panel.position = Vector2(22, 22)
	hud_panel.custom_minimum_size = Vector2(minf(382, viewport_size.x - 310), 0)
	hud_panel.size = Vector2.ZERO
	map_overlay.size = viewport_size
	var panel_size := Vector2(minf(900, viewport_size.x - 64), minf(540, viewport_size.y - 56))
	map_panel.position = (viewport_size - panel_size) * 0.5
	map_panel.size = panel_size
	update_map.call_deferred()


func update_hud() -> void:
	var player := get_node("Player") as CharacterBody3D
	objective.text = exploration.current_objective()
	location.text = "EASTERN TEMPLE DISTRICT  •  COURTYARD"
	for landmark in exploration.landmarks:
		var point: Vector3 = landmark.position
		if (
			Vector2(player.position.x, player.position.z).distance_to(Vector2(point.x, point.z))
			< 10
		):
			location.text = "EASTERN TEMPLE DISTRICT  •  " + str(landmark.name).to_upper()
			break
	var next_distance := -1.0
	for landmark in exploration.landmarks:
		if not exploration.discovered.has(landmark.id):
			var point: Vector3 = landmark.position
			next_distance = Vector2(player.position.x, player.position.z).distance_to(
				Vector2(point.x, point.z)
			)
			break
	status.text = (
		"%d / %d landmarks discovered"
		% [exploration.discovered.size(), exploration.landmarks.size()]
	)
	if next_distance >= 0:
		status.text += "   •   %d m" % int(ceilf(next_distance))
	if map_overlay.visible:
		update_map()


func update_map() -> void:
	if not is_instance_valid(map_diagram):
		return
	map_diagram.player_position = get_node("Player").position
	map_diagram.queue_redraw()
	for landmark in exploration.landmarks:
		var button: Button = map_buttons[landmark.id]
		var unlocked: bool = exploration.discovered.has(landmark.id)
		button.disabled = not unlocked
		button.text = str(landmark.name) + ("\nTRAVEL" if unlocked else "\nUNDISCOVERED")
		button.position = map_diagram.project(landmark.position) - button.custom_minimum_size * 0.5


func toggle_map() -> void:
	map_overlay.visible = not map_overlay.visible
	var mobile := get_node("MobileControls")
	mobile.release_all_actions()
	mobile.visible = not map_overlay.visible
	get_node("Player").set_physics_process(not map_overlay.visible)
	if map_overlay.visible:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		update_map()


func travel_from_map(id: String) -> void:
	if exploration.travel(id, get_node("Player")):
		toggle_map()
		show_notice("Arrived at discovered waypoint")
		update_hud()


func show_notice(message: String) -> void:
	notice.text = message
	notice.show()
	notice_time = 3.0


func save_game() -> void:
	show_notice(
		"Saved locally" if storage.save_position(get_node("Player").position) else "Save failed"
	)


func load_game(path: String = "user://save.json") -> void:
	var player := get_node("Player") as CharacterBody3D
	var restored_point: Vector3 = storage.load_position(path)
	get_node("World/Regions").update_regions(restored_point)
	player.position = restored_point
	player.velocity = Vector3.ZERO
	show_notice("Local save loaded")


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F5:
			save_game()
		elif event.keycode == KEY_F9:
			load_game()
		elif event.keycode == KEY_ESCAPE and map_overlay.visible:
			toggle_map()


func _process(delta: float) -> void:
	exploration.visit(get_node("Player").position)
	if Input.is_action_just_pressed("save_game") and Input.is_action_pressed("save_game"):
		save_game()
	elif Input.is_action_just_pressed("load_game") and Input.is_action_pressed("load_game"):
		load_game()
	if Input.is_action_just_pressed("map_game") and Input.is_action_pressed("map_game"):
		toggle_map()
	hud_time -= delta
	if hud_time <= 0:
		update_hud()
		hud_time = 0.2
	if notice_time > 0:
		notice_time -= delta
		if notice_time <= 0:
			notice.hide()
