import type { AudioPreferences } from "./audio";

export function audioSettingsMarkup(prefs: AudioPreferences) {
  return `<div class="audio-settings"><div class="audio-setting">
    <label class="audio-toggle"><div><strong>BACKGROUND MUSIC</strong><span>观测室 · 三轨背景配乐</span></div><input type="checkbox" data-pref="music" ${prefs.music ? "checked" : ""}/><i class="toggle"></i></label>
    <label class="audio-volume"><span>音乐音量</span><input aria-label="音乐音量" data-volume="musicVolume" type="range" min="0" max="100" step="1" value="${Math.round(prefs.musicVolume * 100)}"/><output>${Math.round(prefs.musicVolume * 100)}%</output></label>
  </div></div>`;
}
