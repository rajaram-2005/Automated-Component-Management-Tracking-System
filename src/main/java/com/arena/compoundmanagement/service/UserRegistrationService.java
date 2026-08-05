package com.arena.compoundmanagement.service;

import com.arena.compoundmanagement.dto.RegisterRequest;
import com.arena.compoundmanagement.model.AppUser;
import com.arena.compoundmanagement.model.Role;
import com.arena.compoundmanagement.repository.AppUserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

@Service
@Transactional
public class UserRegistrationService {

    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;

    public UserRegistrationService(AppUserRepository appUserRepository, PasswordEncoder passwordEncoder) {
        this.appUserRepository = appUserRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public boolean usernameExists(String username) {
        return appUserRepository.existsByUsernameIgnoreCase(username);
    }

    public boolean emailExists(String email) {
        return appUserRepository.existsByEmailIgnoreCase(email);
    }

    public AppUser register(RegisterRequest request) {
        AppUser appUser = new AppUser();
        appUser.setFullName(request.getFullName().trim());
        appUser.setUsername(request.getUsername().trim());
        appUser.setEmail(request.getEmail().trim().toLowerCase(Locale.ROOT));
        appUser.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        appUser.setRole(Role.ENGINEER);
        return appUserRepository.save(appUser);
    }
}
