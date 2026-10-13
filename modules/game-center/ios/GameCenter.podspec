Pod::Spec.new do |s|
  s.name           = 'GameCenter'
  s.version        = '1.0.0'
  s.summary        = 'Game Center sign-in and leaderboards for PewPew'
  s.description    = 'Local Expo module wrapping GameKit: authenticate the local player, submit scores, show leaderboards.'
  s.author         = 'Muhammed Saeed'
  s.homepage       = 'https://pewpew.saeed.sh'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'GameKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
