extends Node3D
## An independently saved expedition; the temple journey remains available on return.

const DESTINATIONS := {
	"Lotus Cliff Sanctuary · 0 km": Vector2i(0, 0),
	"Cloud Monastery · 82 km": Vector2i(640, 0),
	"Amber Highlands · 4,096 km": Vector2i(32000, 0),
	"Eastern Frontier · 99,999 km": Vector2i(781249, 0),
	"Western Frontier · −99,999 km": Vector2i(-781249, 0)
}
var atmosphere: Node3D
var world: Node3D
var player: CharacterBody3D
var encounter: Node3D
var mobile: Control
var controls: Control
var atlas: Control
var sheet: PanelContainer
var hud: PanelContainer
var heading: Label
var detail: Label
var feedback: Label
var route_distance: SpinBox
var save_path := "user://expedition.json"
var restore_on_start := true
var settings := preload("res://scripts/game_settings.gd").new()
var _hud_clock := 0.0
var _save_clock := 0.0
var _notice_clock := 0.0


func _enter_tree() -> void:
	for pair in [
		["move_forward", KEY_W],
		["move_backward", KEY_S],
		["move_left", KEY_A],
		["move_right", KEY_D],
		["jump", KEY_SPACE],
		["sprint", KEY_SHIFT],
		["map_game", KEY_M],
		["settings_game", KEY_ESCAPE],
		["toggle_view", KEY_V]
	]:
		if not InputMap.has_action(pair[0]):
			InputMap.add_action(pair[0])
			var key := InputEventKey.new()
			key.physical_keycode = pair[1]
			InputMap.action_add_event(pair[0], key)


func _ready() -> void:
	world = get_node("World")
	player = get_node("Player")
	world.setup(player)
	atmosphere = preload("res://scripts/expedition_atmosphere.gd").new()
	add_child(atmosphere)
	atmosphere.setup(world, player)
	encounter = preload("res://scripts/expedition_encounter.gd").new()
	add_child(encounter)
	encounter.setup(player, world)
	encounter.notice.connect(show_notice)
	mobile = preload("res://scripts/mobile_controls.gd").new()
	mobile.name = "MobileControls"
	add_child(mobile)
	var canvas := CanvasLayer.new()
	canvas.name = "HUD"
	canvas.layer = 2
	add_child(canvas)
	_build_hud(canvas)
	_build_atlas(canvas)
	controls = preload("res://scripts/expedition_controls.gd").new()
	canvas.add_child(controls)
	controls.setup(self)
	settings.load_settings()
	apply_quality(str(settings.values.quality))
	mobile.configure_controls(
		settings.values.sensitivity, settings.values.joystick_scale, settings.values.sprint_assist
	)
	player.set_camera_distance(settings.values.camera_distance)
	get_viewport().size_changed.connect(resize)
	resize()
	if restore_on_start:
		restore_expedition()
	_refresh_hud()
	print("TEMPLE_EXPEDITION_READY: streamed world, wind skiff and guardian initialized")


func _build_hud(canvas: CanvasLayer) -> void:
	hud = PanelContainer.new()
	hud.add_theme_stylebox_override("panel", panel_style())
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	canvas.add_child(hud)
	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(column)
	heading = label("THE JADE EXPANSE", 21)
	column.add_child(heading)
	detail = label("", 15)
	column.add_child(detail)
	feedback = label("Follow the road. RIDE the skiff. STRIKE and DODGE the guardian.", 15)
	feedback.custom_minimum_size.x = 380
	feedback.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(feedback)


func _build_atlas(canvas: CanvasLayer) -> void:
	atlas = Control.new()
	atlas.name = "ExpeditionAtlas"
	canvas.add_child(atlas)
	var shade := ColorRect.new()
	shade.color = Color(0.015, 0.035, 0.04, 0.92)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	atlas.add_child(shade)
	sheet = PanelContainer.new()
	sheet.add_theme_stylebox_override("panel", panel_style())
	atlas.add_child(sheet)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	sheet.add_child(scroll)
	var box := VBoxContainer.new()
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation", 8)
	scroll.add_child(box)
	box.add_child(label("WORLD ATLAS · 200,000 km span", 24))
	box.add_child(label("Generated regions with temples, roads and guardian grounds.", 16))
	for title in DESTINATIONS:
		add_button(box, title, travel.bind(DESTINATIONS[title]))
	var row := HBoxContainer.new()
	box.add_child(row)
	row.add_child(label("East / west km", 16))
	route_distance = SpinBox.new()
	route_distance.min_value = -99999.9
	route_distance.max_value = 99999.9
	route_distance.step = 0.1
	route_distance.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	route_distance.custom_minimum_size.y = 48
	row.add_child(route_distance)
	add_button(row, "TRAVEL", travel_custom)
	var quality_row := HBoxContainer.new()
	box.add_child(quality_row)
	for preset in ["performance", "balanced", "high"]:
		add_button(quality_row, str(preset).capitalize(), apply_quality.bind(preset))
	var actions := HBoxContainer.new()
	box.add_child(actions)
	add_button(actions, "SAVE", save_with_notice)
	add_button(actions, "RETRY GUARDIAN", retry_encounter)
	add_button(actions, "TEMPLE DISTRICT", return_to_temple)
	add_button(box, "CONTINUE EXPLORING", close_atlas)
	atlas.hide()


func add_button(parent: Node, text: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(0, 46)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.add_theme_font_size_override("font_size", 16)
	button.add_theme_stylebox_override("normal", panel_style())
	button.pressed.connect(callback)
	parent.add_child(button)
	return button


func panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.035, 0.095, 0.105, 0.94)
	style.border_color = Color("968563")
	style.set_border_width_all(1)
	style.set_corner_radius_all(12)
	style.content_margin_left = 15
	style.content_margin_right = 15
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	return style


func label(text: String, font_size: int) -> Label:
	var item := Label.new()
	item.text = text
	item.add_theme_font_size_override("font_size", font_size)
	item.add_theme_color_override("font_color", Color("eadcc0"))
	item.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return item


func resize() -> void:
	var viewport_size := get_viewport().get_visible_rect().size
	var insets: Vector4 = mobile.safe_insets
	hud.position = Vector2(insets.x, insets.y)
	hud.custom_minimum_size = Vector2(minf(420, viewport_size.x * 0.42), 0)
	hud.size = Vector2(hud.custom_minimum_size.x, 150)
	atlas.size = viewport_size
	sheet.size = Vector2(
		minf(780, viewport_size.x - insets.x - insets.z - 20),
		viewport_size.y - insets.y - insets.w - 20
	)
	sheet.position = (viewport_size - sheet.size) * 0.5


func apply_quality(preset: String) -> void:
	settings.set_value("quality", preset)
	get_viewport().scaling_3d_scale = {"performance": 0.70, "balanced": 0.85, "high": 1.0}[preset]
	get_viewport().msaa_3d = Viewport.MSAA_2X if preset == "high" else Viewport.MSAA_DISABLED
	if is_instance_valid(atmosphere):
		atmosphere.apply_quality(preset)
	if world.has_method("apply_quality"):
		world.apply_quality(preset)
	settings.save_settings()


func open_atlas() -> void:
	mobile.release_all_actions()
	controls.release_fingers()
	mobile.hide()
	controls.hide()
	hud.hide()
	atlas.show()
	player.set_physics_process(false)
	encounter.process_mode = Node.PROCESS_MODE_DISABLED
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func close_atlas() -> void:
	atlas.hide()
	mobile.show()
	controls.show()
	hud.show()
	encounter.process_mode = Node.PROCESS_MODE_INHERIT
	player.set_physics_process(not encounter.mounted and encounter.player_health > 0)


func retry_encounter() -> void:
	encounter.restart_encounter()
	player.set_physics_process(not atlas.visible and not encounter.mounted)
	show_notice("Guardian encounter restored")


func travel(sector: Vector2i) -> void:
	mobile.release_all_actions()
	encounter.reset_for_destination()
	world.travel_to(sector)
	encounter.reset_for_destination()
	close_atlas()
	save_expedition()
	show_notice("Arrived at " + world.biome_name())
	_refresh_hud()


func travel_custom() -> void:
	var meters := route_distance.value * 1000.0
	var sector := roundi(meters / 128.0)
	travel(Vector2i(clampi(sector, -781249, 781249), 0))


func save_expedition() -> bool:
	var data: Dictionary = world.world_coordinates()
	data["version"] = 1
	return preload("res://scripts/save_store.gd").new().write_atomic(data, save_path)


func restore_expedition() -> bool:
	if not FileAccess.file_exists(save_path):
		return false
	var file := FileAccess.open(save_path, FileAccess.READ)
	if file == null or file.get_length() > 2048:
		return false
	var data: Variant = JSON.parse_string(file.get_as_text())
	if not data is Dictionary or data.get("version") != 1:
		return false
	if not world.restore_coordinates(data):
		return false
	encounter.reset_for_destination()
	return true


func save_with_notice() -> void:
	show_notice("Expedition saved" if save_expedition() else "Save failed")


func return_to_temple() -> void:
	if not save_expedition():
		show_notice("Could not save expedition; try again")
		return
	mobile.release_all_actions()
	get_tree().root.set_meta("return_to_journey", true)
	get_tree().change_scene_to_file("res://scenes/main.tscn")


func show_notice(text: String) -> void:
	if is_instance_valid(feedback):
		feedback.text = text
		_notice_clock = 5.0


func _refresh_hud() -> void:
	var coordinates: Dictionary = world.world_coordinates()
	var sector: Array = coordinates.sector
	var local: Array = coordinates.local
	var east_km := (float(sector[0]) * 128.0 + float(local[0])) / 1000.0
	heading.text = world.biome_name().to_upper()
	detail.text = "%.3f km east · %s" % [east_km, encounter.status_text()]
	if _notice_clock <= 0:
		feedback.text = (
			"STRIKE nearby · DODGE the warning · RIDE by the skiff\n"
			+ "MAP opens the world atlas and return route."
		)


func _process(delta: float) -> void:
	_hud_clock += delta
	_save_clock += delta
	_notice_clock -= delta
	if _hud_clock >= 0.2:
		_hud_clock = 0
		_refresh_hud()
	if _save_clock >= 15 and autosave_supported():
		_save_clock = 0
		save_expedition()
	if Input.is_action_just_pressed("map_game") or Input.is_action_just_pressed("settings_game"):
		if atlas.visible:
			close_atlas()
		else:
			open_atlas()


func autosave_supported() -> bool:
	return encounter.vehicle.is_on_floor() if encounter.mounted else player.is_on_floor()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and not atlas.visible:
		match event.physical_keycode:
			KEY_F:
				encounter.attack()
			KEY_Q:
				encounter.dodge()
			KEY_E:
				encounter.interact_vehicle()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and is_instance_valid(world):
		save_expedition()
		open_atlas()
