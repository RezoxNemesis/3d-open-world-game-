extends Control
## Contextual quest actions and a schematic, world-linked north-up minimap.

signal overlay_changed

var scene: Node3D
var quest: Node
var player: CharacterBody3D
var exploration: Node
var minimap: Control
var context_button: Button
var dialog_overlay: Control
var dialog_panel: PanelContainer
var primary_button: Button
var dialogue_text: RichTextLabel
var dialog_open := false
var safe_rect := Rect2()


class JourneyMinimap:
	extends Control

	var player: CharacterBody3D
	var exploration: Node
	var quest: Node

	func project(point: Vector3) -> Vector2:
		var delta := Vector2(point.x - player.position.x, point.z - player.position.z)
		var radius := size.x * 0.39
		return size * 0.5 + (delta * radius / 60.0).limit_length(radius)

	func facing_arrow() -> PackedVector2Array:
		var arrow := PackedVector2Array()
		for point in [Vector2(0, -8), Vector2(5, 5), Vector2(0, 2), Vector2(-5, 5)]:
			arrow.append(size * 0.5 + point.rotated(-player.yaw))
		return arrow

	func _draw() -> void:
		if not is_instance_valid(player):
			return
		var center := size * 0.5
		var radius := size.x * 0.48
		draw_circle(center, radius, Color(0.025, 0.085, 0.09, 0.88))
		draw_arc(center, radius, 0, TAU, 64, Color(0.87, 0.75, 0.52, 0.7), 1.4, true)
		for line in [
			[Vector3(-30, 0, 1), Vector3.ZERO],
			[Vector3.ZERO, Vector3(0, 0, -16)],
			[Vector3.ZERO, Vector3(50, 0, -2.6)],
			[Vector3(50, 0, -2.6), Vector3(50, 10, -32)],
			[Vector3(50, 10, -32), Vector3(46, 10, -42)]
		]:
			draw_line(project(line[0]), project(line[1]), Color(0.6, 0.69, 0.58, 0.35), 1.5, true)
		for landmark in exploration.landmarks:
			var known: bool = exploration.discovered.has(landmark.id)
			var color := Color("e5c47e") if known else Color("718c88")
			draw_circle(project(landmark.position), 3.5, color)
		if quest.stage < 3:
			var target: Vector3 = quest.RELIC_POSITION if quest.stage == 1 else quest.GUIDE_POSITION
			var icon := project(target)
			draw_colored_polygon(
				PackedVector2Array(
					[
						icon + Vector2(0, -6),
						icon + Vector2(5, 0),
						icon + Vector2(0, 6),
						icon + Vector2(-5, 0)
					]
				),
				Color("a6e0c5")
			)
		draw_colored_polygon(facing_arrow(), Color("fff0be"))

		draw_string(
			ThemeDB.fallback_font,
			Vector2(center.x - 5, 18),
			"N",
			HORIZONTAL_ALIGNMENT_LEFT,
			-1,
			13,
			Color("dfc184")
		)


func setup(owner_scene: Node3D, story: Node, discoveries: Node, traveler: CharacterBody3D) -> void:
	scene = owner_scene
	quest = story
	exploration = discoveries
	player = traveler
	name = "JourneyInterface"
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	minimap = JourneyMinimap.new()
	minimap.player = player
	minimap.exploration = exploration
	minimap.quest = quest
	minimap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(minimap)
	context_button = Button.new()
	context_button.custom_minimum_size = Vector2(184, 56)
	context_button.add_theme_font_size_override("font_size", 18)
	scene.style_button(context_button)
	context_button.pressed.connect(interact)
	add_child(context_button)
	_build_dialogue()
	refresh()


func _build_dialogue() -> void:
	dialog_overlay = Control.new()
	add_child(dialog_overlay)
	var backdrop := ColorRect.new()
	backdrop.color = Color(0.01, 0.025, 0.03, 0.75)
	dialog_overlay.add_child(backdrop)
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dialog_panel = PanelContainer.new()
	dialog_panel.add_theme_stylebox_override("panel", scene.panel_style())
	dialog_overlay.add_child(dialog_panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 15)
	dialog_panel.add_child(box)
	box.add_child(scene.make_label("TEMPLE REALM  ·  FORGOTTEN LANTERN", 20, scene.GOLD))
	box.add_child(scene.make_label("KEEPER SEN", 24, scene.PALE))
	dialogue_text = RichTextLabel.new()
	dialogue_text.add_theme_font_size_override("normal_font_size", 20)
	dialogue_text.add_theme_color_override("default_color", scene.PALE)
	dialogue_text.custom_minimum_size.y = 120
	dialogue_text.scroll_active = false
	dialogue_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	dialogue_text.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(dialogue_text)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 16)
	box.add_child(actions)
	primary_button = Button.new()
	primary_button.custom_minimum_size = Vector2(230, 56)
	primary_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	primary_button.add_theme_font_size_override("font_size", 18)
	scene.style_button(primary_button)
	primary_button.pressed.connect(_advance)
	actions.add_child(primary_button)
	var close := Button.new()
	close.text = "CLOSE"
	close.custom_minimum_size = Vector2(130, 56)
	close.add_theme_font_size_override("font_size", 18)
	scene.style_button(close)
	close.pressed.connect(close_dialog)
	actions.add_child(close)
	dialog_overlay.hide()


func resize(safe: Rect2, viewport_size: Vector2) -> void:
	safe_rect = safe
	size = viewport_size
	var diameter := 128.0 if safe.size.y < 600 else 140.0
	minimap.size = Vector2.ONE * diameter
	minimap.position = Vector2(safe.end.x - diameter - 24, safe.position.y + 118)
	context_button.position = Vector2(safe.end.x - 435, safe.end.y - 156)
	dialog_overlay.size = viewport_size
	var panel_size := Vector2(minf(680, safe.size.x - 64), minf(350, safe.size.y - 48))
	dialog_panel.size = panel_size
	dialog_panel.position = safe.position + (safe.size - panel_size) * 0.5


func refresh() -> void:
	if not is_instance_valid(quest):
		return
	var other_overlay: bool = scene.map_overlay.visible or scene.settings_overlay.visible
	minimap.visible = not dialog_open and not other_overlay
	minimap.queue_redraw()
	var current: String = quest.context()
	context_button.visible = not dialog_open and not other_overlay and current != ""
	context_button.text = "RECOVER LANTERN" if current == "relic" else "SPEAK TO SEN"


func interact() -> void:
	if dialog_open or scene.map_overlay.visible or scene.settings_overlay.visible:
		return
	if quest.context() == "relic":
		if quest.collect():
			scene.show_notice("Jade lantern recovered · Return to Keeper Sen")
	else:
		open_dialog()
	refresh()


func open_dialog() -> bool:
	if quest.context() != "keeper":
		return false
	dialogue_text.text = [
		(
			"The jade lantern once guided travelers through these mountains. "
			+ "Follow the eastern gate, climb the stone stairway, and recover it from the upper Sky Temple."
		),
		(
			"Beyond the eastern gate, turn south onto the stair approach, "
			+ "then climb north to the Sky Temple. The jade lantern is waiting on the upper terrace."
		),
		(
			"You brought its light home. Carry this lantern on your travels, "
			+ "and let the old paths shine again."
		),
		(
			"The lantern is yours now. Explore the gardens, discover each landmark, "
			+ "and return whenever you need a quiet moment."
		)
	][quest.stage]
	primary_button.text = ["ACCEPT JOURNEY", "CONTINUE JOURNEY", "RETURN LANTERN", "FAREWELL"][
		quest.stage
	]
	dialog_open = true
	dialog_overlay.show()
	overlay_changed.emit()
	refresh()
	return true


func close_dialog() -> void:
	dialog_open = false
	dialog_overlay.hide()
	overlay_changed.emit()
	refresh()


func _advance() -> void:
	if quest.stage == 0:
		quest.accept()
	elif quest.stage == 2:
		if quest.deliver():
			scene.show_notice("Journey complete · Jade lantern equipped")
	close_dialog()
